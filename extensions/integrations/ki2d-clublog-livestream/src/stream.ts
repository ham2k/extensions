// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The queue between the logging panel and Club Log's REST API
// (https://clublog.org/support/knowledgebase/rest-api/for-llms/club-log-api-information-for-llms/).
//
// A Live Stream shows what reaches the station's Club Log log, so feeding it
// is uploading each contact as it is logged: `POST /api/v1/qso/batch`, one
// ADIF record per contact, with the operator's own `cl_` token. Club Log
// documents no Live Stream write of its own.
//
// What the API allows shapes the pacing: 60 requests a minute and 1,000 a
// UTC day per account, a batch of up to 100 contacts counting as one. A
// request goes out as soon as there is something to send and none went out
// in the last MIN_GAP_MS, the cadence Club Log's own Gateway keeps. That
// holds while what is left of the day's allowance could still cover the rest
// of the UTC day at one request per SLOW_GAP_MS; past that, what is left is
// spread evenly to midnight, so a 24-hour contest is still streaming at
// 23:59. Club Log's rules for what not to resend are followed
// to the letter: a 401 stops everything until the token changes, a 422 or a
// rejected contact is never sent again, a 429 waits what it says.
//
// What to send comes from the app's integration calls (`observed`): the
// contacts logged, edited and deleted in the operation since the previous
// call, each with its uuid. Club Log knows a contact by what it matches on
// (`signatureOf`), so the stream keeps, per operation, the signature each
// uuid was last sent under, and Club Log's id for each signature.
//
// Everything here lives in memory — the host's key-value store does too, and
// holds 4 KB — so a runtime restart forgets the queue and which contacts have
// Club Log ids. The call that follows a restart says `open`, and hands the
// operation's log for `sweep`, which sends its last hour again; Club Log
// answers what it already holds as duplicates. The ids are the part no sweep
// recovers: an edit or a deletion of a contact sent before the restart
// leaves the old one on Club Log as it was sent.

import type { JSONValue } from "@ham2k/extension-sdk"

export const API_BASE = "https://clublog.org/api/v1"

export const MIN_GAP_MS = 30 * 1000
export const SLOW_GAP_MS = 5 * 60 * 1000
export const BATCH_LIMIT = 100
/// Club Log's usual daily allowance, less a margin for the operator's other
/// clients and for the account check.
export const DAILY_REQUESTS = 950
/// How long a server or network failure waits before the next try: Club Log
/// asks that a write that may have applied is not repeated at once.
export const FIRST_BACKOFF_MS = 2 * 60 * 1000
export const MAX_BACKOFF_MS = 15 * 60 * 1000
/// How far back `sweep` reaches. Club Log lists a Live Stream for 45 minutes
/// after its latest contact.
export const SWEEP_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

type Qso = Record<string, JSONValue>

export interface Post {
  kind: "post"
  signature: string
  operationUuid: string
  call: string
  qso: Qso
  operation: Qso
}

export interface Deletion {
  kind: "delete"
  signature: string
  operationUuid: string
  qsoid: number
}

export type Job = Post | Deletion

export interface FetchAnswer {
  status: number
  body: string
}

export interface StreamDeps {
  fetch(url: string, options: { method: "POST"; headers: Record<string, string>; body: string; timeout: number }): Promise<FetchAnswer>
  /// One contact as one ADIF record, ending `<EOR>`.
  adif(qso: Qso, operation: Qso): Promise<string>
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  log(message: string): void
  /// A problem only the operator can fix, worded by `problem`; shown once per
  /// key until it changes.
  tell(problem: Problem): void
}

/// What an integration call says changed in an operation since its previous
/// call (`IntegrationChanges`).
export interface Changes {
  logged: Qso[]
  updated: Qso[]
  deleted: string[]
}

export type Problem =
  | { key: "tokenRefused" }
  | { key: "callRefused"; call: string; message: string }
  | { key: "rejected"; call: string; theirCall: string; message: string }

/// What Club Log matches a contact on. An edit that changes any of it is, to
/// Club Log, a different contact.
export function signatureOf(qso: Qso): string | undefined {
  const their = qso.their as Record<string, JSONValue> | undefined
  const call = typeof their?.call === "string" ? their.call.trim().toUpperCase() : ""
  const at = qso.startAtMillis
  if (!call || typeof at !== "number" || qso.band === "event") return undefined
  return [at, call, qso.band ?? "", qso.mode ?? ""].join("|")
}

function isUploadable(qso: Qso): boolean {
  return qso.deleted !== true && signatureOf(qso) !== undefined
}

export class Stream {
  private queue: Job[] = []
  /// Club Log's id for each contact it holds, by operation then signature.
  private ids = new Map<string, Map<string, number>>()
  /// The signature each contact was last queued under, by operation then
  /// uuid: what an edit or a deletion, which come by uuid, takes back.
  private known = new Map<string, Map<string, string>>()
  private token: string | undefined
  private refusedToken: string | undefined
  private lastSentAt = -Infinity
  private pausedUntil = -Infinity
  private backoffMs = 0
  private day = -1
  private sentToday = 0
  private timer: unknown = undefined
  private told = new Set<string>()
  private readonly deps: StreamDeps

  constructor(deps: StreamDeps) {
    this.deps = deps
  }

  /// One integration call about an operation: what changed in it since the
  /// previous call, and, on `open`, its `log` as it stands for the sweep.
  ///
  /// Without a token nothing goes out, but what changed still queues, and
  /// leaves as soon as a call brings one.
  observed(args: { token?: string; operation: Qso; changes: Changes; log?: Qso[] }): void {
    const { operation, changes, log } = args
    const operationUuid = String(operation.uuid ?? "")
    if (!operationUuid) return
    if (args.token !== this.token) this.told.delete("tokenRefused")
    this.token = args.token
    const call = String(operation.stationCall ?? "").trim().toUpperCase()

    for (const uuid of changes.deleted) this.forget(operationUuid, uuid)
    for (const qso of [...changes.logged, ...changes.updated]) this.changed(operationUuid, call, operation, qso)
    if (log && call) this.sweep(operationUuid, call, operation, log)
    this.schedule()
  }

  /// A contact logged or edited: sent as it now is, and, when an edit moved
  /// what Club Log matches on, the copy under the old signature taken back.
  private changed(operationUuid: string, call: string, operation: Qso, qso: Qso): void {
    const uuid = typeof qso.uuid === "string" ? qso.uuid : undefined
    const signature = isUploadable(qso) ? signatureOf(qso) : undefined
    if (uuid) {
      const known = this.knownFor(operationUuid)
      const was = known.get(uuid)
      if (was && was !== signature) this.withdraw(operationUuid, was)
      if (signature) known.set(uuid, signature)
      else known.delete(uuid)
    }
    if (signature && call) this.post({ kind: "post", signature, operationUuid, call, qso, operation })
  }

  private forget(operationUuid: string, uuid: string): void {
    const known = this.knownFor(operationUuid)
    const was = known.get(uuid)
    known.delete(uuid)
    if (was) this.withdraw(operationUuid, was)
  }

  /// Takes back what was queued or sent under [signature]: a contact still
  /// waiting is never sent, and one Club Log holds is deleted there.
  private withdraw(operationUuid: string, signature: string): void {
    this.queue = this.queue.filter((job) => !(job.kind === "post" && job.operationUuid === operationUuid && job.signature === signature))
    const qsoid = this.idsFor(operationUuid).get(signature)
    if (qsoid !== undefined) this.remove(operationUuid, signature, qsoid)
  }

  /// The operation's last hour, minus what this stream already queued: after
  /// a restart, what the forgotten queue may have held; on a switch turned
  /// on mid-operation, what a Live Stream still shows.
  private sweep(operationUuid: string, call: string, operation: Qso, log: Qso[]): void {
    const known = this.knownFor(operationUuid)
    const since = this.deps.now() - SWEEP_MS
    for (const stored of log) {
      const uuid = typeof stored.uuid === "string" ? stored.uuid : undefined
      if (!uuid || known.has(uuid) || !isUploadable(stored) || (stored.startAtMillis as number) < since) continue
      const signature = signatureOf(stored)!
      known.set(uuid, signature)
      this.post({ kind: "post", signature, operationUuid, call, qso: stored, operation })
    }
  }

  /// How many jobs wait, for tests and the log.
  get pending(): number {
    return this.queue.length
  }

  private knownFor(operationUuid: string): Map<string, string> {
    let known = this.known.get(operationUuid)
    if (!known) this.known.set(operationUuid, (known = new Map()))
    return known
  }

  private idsFor(operationUuid: string): Map<string, number> {
    let ids = this.ids.get(operationUuid)
    if (!ids) this.ids.set(operationUuid, (ids = new Map()))
    return ids
  }

  /// The latest version of a contact replaces any earlier one still waiting.
  private post(job: Post): void {
    this.queue = this.queue.filter((queued) => !(queued.kind === "post" && queued.operationUuid === job.operationUuid && queued.signature === job.signature))
    this.queue.push(job)
  }

  private remove(operationUuid: string, signature: string, qsoid: number): void {
    this.idsFor(operationUuid).delete(signature)
    this.queue.push({ kind: "delete", signature, operationUuid, qsoid })
  }

  private gapMs(now: number): number {
    this.rollDay(now)
    const left = DAILY_REQUESTS - this.sentToday
    const untilMidnight = DAY_MS - (now % DAY_MS)
    if (left <= 0) return untilMidnight
    if (left > untilMidnight / SLOW_GAP_MS) return MIN_GAP_MS
    return Math.max(MIN_GAP_MS, Math.ceil(untilMidnight / left))
  }

  private rollDay(now: number): void {
    const day = Math.floor(now / DAY_MS)
    if (day !== this.day) {
      this.day = day
      this.sentToday = 0
    }
  }

  private schedule(): void {
    if (this.timer !== undefined || this.queue.length === 0) return
    if (!this.token || this.token === this.refusedToken) return
    const now = this.deps.now()
    const at = Math.max(this.lastSentAt + this.gapMs(now), this.pausedUntil)
    this.timer = this.deps.setTimeout(() => {
      this.timer = undefined
      void this.drain().finally(() => this.schedule())
    }, Math.max(0, at - now))
  }

  /// One request: the deletions waiting, or else up to BATCH_LIMIT contacts.
  async drain(): Promise<void> {
    const token = this.token
    if (!token || token === this.refusedToken || this.queue.length === 0) return
    const deletions = this.queue.filter((job): job is Deletion => job.kind === "delete")
    const batch = deletions.length ? deletions.slice(0, BATCH_LIMIT) : (this.queue.filter((job) => job.kind === "post") as Post[]).slice(0, BATCH_LIMIT)

    let request: { path: string; body: JSONValue; items: Job[] }
    if (batch[0].kind === "delete") {
      request = { path: "/qso/deletions", body: { qsoids: (batch as Deletion[]).map((job) => job.qsoid) }, items: batch }
    } else {
      const items: Post[] = []
      const qsos: JSONValue[] = []
      for (const job of batch as Post[]) {
        try {
          qsos.push({ call: job.call, adif: await this.deps.adif(job.qso, job.operation) })
          items.push(job)
        } catch (error) {
          // A contact the exporter cannot write is not one a retry will fix.
          this.deps.log(`Club Log: no ADIF for ${job.signature}: ${error instanceof Error ? error.message : String(error)}`)
          this.drop([job])
        }
      }
      if (items.length === 0) return
      request = { path: "/qso/batch", body: { qsos }, items }
    }

    const now = this.deps.now()
    this.rollDay(now)
    this.lastSentAt = now
    this.sentToday += 1
    let answer: FetchAnswer
    try {
      answer = await this.deps.fetch(`${API_BASE}${request.path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request.body),
        timeout: 20 * 1000,
      })
    } catch (error) {
      this.deps.log(`Club Log: ${request.path} failed: ${error instanceof Error ? error.message : String(error)}`)
      this.backOff()
      return
    }
    this.deps.log(`Club Log: ${request.path} (${request.items.length}) → ${answer.status} ${answer.body.slice(0, 500)}`)
    this.answered(token, request.items, answer)
  }

  private answered(token: string, items: Job[], answer: FetchAnswer): void {
    const body = parse(answer.body)
    const error = (body?.error ?? undefined) as Record<string, JSONValue> | undefined
    const message = typeof error?.message === "string" ? error.message : `HTTP ${answer.status}`

    if (answer.status === 200 || answer.status === 201) {
      this.backoffMs = 0
      const results = Array.isArray(body?.results) ? (body.results as Record<string, JSONValue>[]) : []
      items.forEach((job, index) => this.settle(job, results[index]))
      this.drop(items)
      return
    }
    if (answer.status === 401) {
      this.refusedToken = token
      this.tell({ key: "tokenRefused" })
      return
    }
    if (answer.status === 403) {
      // The callsign is not on the token's account; nothing for it will pass.
      const calls = new Set(items.flatMap((job) => (job.kind === "post" ? [job.call] : [])))
      for (const call of calls) this.tell({ key: "callRefused", call, message })
      this.queue = this.queue.filter((job) => !(job.kind === "post" && calls.has(job.call)))
      this.drop(items)
      return
    }
    if (answer.status === 429) {
      const details = (error?.details ?? undefined) as Record<string, JSONValue> | undefined
      const seconds = Number(details?.retry_after)
      this.pausedUntil = this.deps.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60 * 1000)
      return
    }
    if (answer.status === 422) {
      this.deps.log(`Club Log refused the request: ${message}`)
      for (const job of items) if (job.kind === "post") this.tellRejected(job, message)
      this.drop(items)
      return
    }
    this.deps.log(`Club Log: ${message}`)
    this.backOff()
  }

  private settle(job: Job, result: Record<string, JSONValue> | undefined): void {
    const status = typeof result?.status === "string" ? result.status : undefined
    if (job.kind === "delete") return
    if (status === "created" || status === "duplicate" || status === "updated") {
      if (typeof result?.qsoid === "number") this.idsFor(job.operationUuid).set(job.signature, result.qsoid)
      if (typeof result?.warning === "string") this.deps.log(`Club Log: ${job.signature}: ${result.warning}`)
      return
    }
    this.tellRejected(job, typeof result?.message === "string" ? result.message : status ?? "no answer")
  }

  private tellRejected(job: Post, message: string): void {
    const their = job.qso.their as Record<string, JSONValue> | undefined
    this.tell({ key: "rejected", call: job.call, theirCall: String(their?.call ?? ""), message })
  }

  /// Once per reason and station call, not per contact: Club Log refuses a
  /// callsign the token's account does not hold item by item, inside a 200,
  /// so an operation under the wrong call would otherwise raise a notice per
  /// contact.
  private tell(problem: Problem): void {
    const id = problem.key === "tokenRefused" ? problem.key : `${problem.key}:${problem.call}:${problem.message}`
    if (this.told.has(id)) return
    this.told.add(id)
    this.deps.tell(problem)
  }

  private drop(items: Job[]): void {
    const sent = new Set(items)
    this.queue = this.queue.filter((job) => !sent.has(job))
  }

  private backOff(): void {
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs ? this.backoffMs * 2 : FIRST_BACKOFF_MS)
    this.pausedUntil = this.deps.now() + this.backoffMs
  }
}

function parse(body: string): Record<string, JSONValue> | undefined {
  try {
    const value = JSON.parse(body) as JSONValue
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JSONValue>) : undefined
  } catch {
    return undefined
  }
}

/// The record of an ADIF file, without its header: what Club Log's `adif`
/// field takes.
///
/// Its bands are upper-cased. ADIF bands are case-insensitive, but Club Log
/// rejects `40m` ("Invalid or unsupported band") and takes `40M`, while the
/// exporter writes them as ADIF lists them, lower case.
export function recordOf(file: string): string {
  const end = file.search(/<eoh>/i)
  const record = (end >= 0 ? file.slice(end + 5) : file).trim()
  if (!/<eor>/i.test(record)) throw new Error("the exporter wrote no record")
  const tag = /<BAND(?:_RX)?:(\d+)(?::[^>]*)?>/gi
  let out = ""
  let from = 0
  for (let match = tag.exec(record); match; match = tag.exec(record)) {
    const start = match.index + match[0].length
    const stop = start + Number(match[1])
    out += record.slice(from, start) + record.slice(start, stop).toUpperCase()
    from = stop
    tag.lastIndex = stop
  }
  return out + record.slice(from)
}
