// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The network work: find the contest's board and read it for the panes, and
// post the operation's score for the assistant when one is due.
//
// None of it is awaited by a render beyond a short wait, since the app gives
// a render five seconds and the board's pages are large and slowest on the
// weekends that matter. A render asks for what it needs and draws what is
// held; each piece of work runs once at a time, and when one finishes,
// `onChange` lets the panel draw again.
//
// Posting rides on the assistant's calls rather than a timer of its own: a
// timer runs with no hook context, so it could read neither the log nor the
// score. The assistant is called each minute (`tick:60`) and on each contact
// logged, whether or not a pane is on screen, and posts when the last post
// is as old as its interval (2, 3 or 5 minutes) and the score has moved.
//
// Everything here lives in memory and starts over with the runtime.

import type { JSONValue, OperationScores, ScoreTally } from "@ham2k/extension-sdk"

import { POST_URL, basicAuth, readAnswer, scoreXml } from "./post.ts"
import type { PostAnswer, Qth, Totals } from "./post.ts"
import { SITE, candidateOrder, contestIdOf, parseBoard, parseContestRules, parseContests, rulesFor, sameContest } from "./scoreboard.ts"
import type { Board, ContestRules } from "./scoreboard.ts"

/// The intervals the assistant offers, in minutes, and the one it starts with.
export const POST_INTERVALS = [2, 3, 5] as const
export const DEFAULT_INTERVAL = 5
export const POST_EVERY_MS = 5 * 60 * 1000
/// A tick lands a little after the minute; a post 4½ minutes after the last
/// is the 5-minute one.
const POST_SLACK_MS = 30 * 1000
/// After the board refuses the call and password, how long before trying
/// the same ones again. Any other refusal waits the usual five minutes.
export const AUTH_REFUSED_WAIT_MS = 30 * 60 * 1000
const BOARD_FRESH_MS = 45 * 1000
const RULES_FRESH_MS = 24 * 60 * 60 * 1000
const FOUND_FRESH_MS = 60 * 60 * 1000
/// A contest not found, or found only on a closed board, is looked for again
/// this soon: it may be about to go on the air, on a board of its own.
const MISSING_FRESH_MS = 5 * 60 * 1000
/// A board, a search or a post that failed is tried again after this, by
/// the next render or assistant call: just under their minute.
const FAILED_RETRY_MS = 50 * 1000
/// How many of the picker's contests to open looking for the operation's.
const SEARCH_LIMIT = 8
/// A log with no contact this recent is not on the air, and is not posted.
export const LIVE_WITHIN_MS = 60 * 60 * 1000

type Qso = Record<string, JSONValue>

export interface FetchAnswer {
  status: number
  body: string
}

export interface LiveDeps {
  fetch(url: string, options?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeout?: number }): Promise<FetchAnswer>
  now(): number
  log(message: string): void
}

export interface ContestRef {
  type: string
  ref: Record<string, JSONValue>
}

/// The operation's contest: the first of its refs the app marks as one.
export function contestRefOf(operation: Record<string, JSONValue>): ContestRef | undefined {
  const refs = Array.isArray(operation.refs) ? (operation.refs as Record<string, JSONValue>[]) : []
  const ref = refs.find((candidate) => candidate && candidate.contest === true && typeof candidate.type === "string")
  return ref ? { type: ref.type as string, ref } : undefined
}

/// The tally a contest's scorer reports for the whole operation: its total and,
/// where it gives them, QSOs, points and multipliers.
export function totalsOf(scores: OperationScores | null | undefined, scorerKey: string): Totals | undefined {
  const tallies = scores?.[scorerKey]
  if (!tallies) return undefined
  const tally = Object.values(tallies).find((candidate) => candidate && candidate.for !== "day") as ScoreTally | undefined
  if (!tally || typeof tally.total !== "number" || !Number.isFinite(tally.total)) return undefined
  const number = (value: JSONValue | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
  return { score: tally.total, qsos: number(tally.qsos), points: number(tally.points), mults: number(tally.mults) }
}

/// When the log's latest contact was made, deleted ones aside.
export function lastContactAt(qsos: Qso[]): number | undefined {
  let latest: number | undefined
  for (const qso of qsos) {
    if (qso.deleted === true || typeof qso.startAtMillis !== "number") continue
    if (latest === undefined || qso.startAtMillis > latest) latest = qso.startAtMillis
  }
  return latest
}

export type PostState =
  | { kind: "idle" }
  | { kind: "noContest" }
  | { kind: "noCall" }
  | { kind: "noAccount" }
  | { kind: "notLive" }
  | { kind: "noScores" }
  | { kind: "noTally" }
  | { kind: "noExport"; message: string }
  | { kind: "notOnBoard"; contestId: string }
  | { kind: "posting" }
  | { kind: "posted"; at: number; score: number }
  | { kind: "refused"; at: number; message: string; auth?: boolean }
  | { kind: "failed"; at: number; message: string }

interface Posted {
  at: number
  signature: string
  /// What the attempt was made with: a refusal holds only while these stay.
  attempt: string
  answer: PostAnswer
  score: number
  /// The contest, when the board does not take it and nothing was sent.
  notOnBoard?: string
}

/// What a post is made with, gathered by the assistant call that found it due.
export interface PostRequest {
  operationUuid: string
  call: string
  password: string
  /// The Cabrillo log's header lines.
  headers: Record<string, string>
  totals: Totals
  /// What identifies the score: unchanged, it is not posted again.
  signature: string
  qsos: Qso[]
  /// Whether to send the contacts by band and mode.
  breakdown: boolean
  /// How often to post, at most.
  everyMs: number
  qth: Qth
  soft: string
  version: string
}

/// What a render can say of a board, from what is held.
/// A board read before, which could not be read again since, is `stale`.
export type BoardState =
  | { kind: "loading" }
  | { kind: "ready"; board: Board; stale?: { since: number; message: string } }
  | { kind: "failed"; message: string }
/// What a render can say of the search for a contest's board.
export type FoundState = { kind: "searching" } | { kind: "found"; id: string } | { kind: "missing" } | { kind: "failed"; message: string }

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export class Live {
  /// Called when a piece of work finishes, so the panes can draw again.
  onChange: () => void = () => {}

  private rules: { at: number; rules: ContestRules[] } | undefined
  private rulesWork: Promise<ContestRules[]> | undefined
  /// `at` is when the board was last asked for; `readAt`, when it was last read.
  private boards = new Map<string, { at: number; board?: Board; readAt?: number; error?: string }>()
  private boardWork = new Map<string, Promise<Board>>()
  /// A search that failed keeps the board an earlier one found.
  private found = new Map<string, { at: number; id?: string; closed?: boolean; error?: string }>()
  private foundWork = new Map<string, Promise<string | undefined>>()
  private posted = new Map<string, Posted>()
  private postWork = new Map<string, Promise<void>>()
  private failures = new Map<string, { at: number; message: string }>()
  private readonly deps: LiveDeps

  constructor(deps: LiveDeps) {
    this.deps = deps
  }

  /// Work started for a render, to wait on for a moment before drawing. Posts
  /// are left out unless asked for: the pane draws again when one is done.
  pending(withPosts = false): Promise<unknown>[] {
    return [...this.boardWork.values(), ...this.foundWork.values(), ...(withPosts ? this.postWork.values() : []), ...(this.rulesWork ? [this.rulesWork] : [])]
  }

  /// The board's contest list, from its settings page; held for a day, and
  /// kept past that while the page cannot be read again.
  contestRules(): Promise<ContestRules[]> {
    const now = this.deps.now()
    if (this.rules && now - this.rules.at < RULES_FRESH_MS) return Promise.resolve(this.rules.rules)
    this.rulesWork ??= (async () => {
      try {
        const answer = await this.deps.fetch(`${SITE}/settings/`, { timeout: 15 * 1000 })
        if (answer.status !== 200) throw new Error(`the board's contest list answered HTTP ${answer.status}`)
        const rules = parseContestRules(answer.body)
        if (!rules.length) throw new Error("the board's contest list could not be read")
        this.rules = { at: now, rules }
        return rules
      } catch (error) {
        if (this.rules) {
          this.deps.log(`Live Scoreboard: keeping the contest list read before: ${messageOf(error)}`)
          return this.rules.rules
        }
        throw error
      } finally {
        this.rulesWork = undefined
      }
    })()
    return this.rulesWork
  }

  /// One board, read again when the last reading is older than a tick.
  board(id: string): Promise<Board> {
    const held = this.boards.get(id)
    const age = held ? this.deps.now() - held.at : Infinity
    if (held?.error && age < FAILED_RETRY_MS) return held.board ? Promise.resolve(held.board) : Promise.reject(new Error(held.error))
    if (held?.board && !held.error && age < BOARD_FRESH_MS) return Promise.resolve(held.board)
    let work = this.boardWork.get(id)
    if (!work) {
      work = (async () => {
        try {
          const answer = await this.deps.fetch(`${SITE}/scoreboard/?contest_id=${encodeURIComponent(id)}`, { timeout: 15 * 1000 })
          if (answer.status !== 200) throw new Error(`HTTP ${answer.status}`)
          const board = parseBoard(answer.body)
          if (!board.categories.length && !board.contestId) this.deps.log(`Live Scoreboard: board ${id} read, but neither a category nor the contest was found on it`)
          this.boards.set(id, { at: this.deps.now(), board, readAt: this.deps.now() })
          return board
        } catch (error) {
          this.deps.log(`Live Scoreboard: board ${id} could not be read: ${messageOf(error)}`)
          this.boards.set(id, { at: this.deps.now(), board: held?.board, readAt: held?.readAt, error: messageOf(error) })
          throw error
        } finally {
          this.boardWork.delete(id)
          this.onChange()
        }
      })()
      this.boardWork.set(id, work)
    }
    return work
  }

  /// The board as held, reading it again in the background when it is old.
  boardNow(id: string): BoardState {
    this.board(id).catch(() => {})
    const held = this.boards.get(id)
    if (held?.board) return { kind: "ready", board: held.board, ...(held.error ? { stale: { since: held.readAt ?? held.at, message: held.error } } : {}) }
    if (held?.error && !this.boardWork.has(id)) return { kind: "failed", message: held.error }
    return { kind: "loading" }
  }

  /// The board a contest is on, by its Cabrillo id: the picker's contests
  /// named like it first, then those on the air, coming and closed.
  findBoard(cabrilloId: string): Promise<string | undefined> {
    const key = cabrilloId.toUpperCase()
    const held = this.found.get(key)
    const age = held ? this.deps.now() - held.at : Infinity
    if (held?.error && age < FAILED_RETRY_MS) return Promise.reject(new Error(held.error))
    if (held && !held.error && age < (held.id && !held.closed ? FOUND_FRESH_MS : MISSING_FRESH_MS)) return Promise.resolve(held.id)
    let work = this.foundWork.get(key)
    if (!work) {
      work = (async () => {
        try {
          const front = await this.deps.fetch(`${SITE}/scoreboard/`, { timeout: 15 * 1000 })
          if (front.status !== 200) throw new Error(`HTTP ${front.status}`)
          const contests = parseContests(front.body)
          if (!contests.length) throw new Error("the board's list of contests could not be read")
          // The front page is itself a board; a contest it shows needs no search.
          const shown = sameContest(contestIdOf(front.body), cabrilloId) ? contests.find((contest) => contest.selected) : undefined
          let id = shown?.id
          let closed = shown?.state === "closed"
          if (!id) {
            // Without the contest list the search goes by the picker's order
            // alone, and finding nothing that way is no answer either.
            let rulesError: string | undefined
            const rule = await this.contestRules()
              .then((rules) => rulesFor(rules, cabrilloId) ?? null)
              .catch((error) => {
                rulesError = messageOf(error)
                this.deps.log(`Live Scoreboard: searching for ${cabrilloId} without the contest list: ${rulesError}`)
                return undefined
              })
            // A contest the list does not have has no board to find.
            const candidates = rule === null ? [] : candidateOrder(contests, rule?.name).slice(0, SEARCH_LIMIT)
            let unread = 0
            for (const contest of candidates) {
              const board = await this.board(contest.id).catch(() => {
                unread++
                return undefined
              })
              if (sameContest(board?.contestId, cabrilloId)) {
                id = contest.id
                closed = contest.state === "closed"
                break
              }
            }
            // Not found among boards that could not all be read is no
            // answer: the search fails, and is tried again.
            if (!id && unread) throw new Error(`${unread} of the board's pages could not be read`)
            if (!id && rulesError) throw new Error(rulesError)
          }
          this.found.set(key, { at: this.deps.now(), id, closed })
          return id
        } catch (error) {
          this.deps.log(`Live Scoreboard: the search for ${cabrilloId}'s board failed: ${messageOf(error)}`)
          const before = this.found.get(key)
          this.found.set(key, { at: this.deps.now(), error: messageOf(error), ...(before?.id ? { id: before.id, closed: before.closed } : {}) })
          throw error
        } finally {
          this.foundWork.delete(key)
          this.onChange()
        }
      })()
      this.foundWork.set(key, work)
    }
    return work
  }

  /// The search as it stands, starting it when it is due.
  foundNow(cabrilloId: string): FoundState {
    this.findBoard(cabrilloId).catch(() => {})
    const key = cabrilloId.toUpperCase()
    if (this.foundWork.has(key)) {
      const held = this.found.get(key)
      return held?.id ? { kind: "found", id: held.id } : { kind: "searching" }
    }
    const held = this.found.get(key)
    if (!held) return { kind: "searching" }
    if (held.id) return { kind: "found", id: held.id }
    if (held.error) return { kind: "failed", message: held.error }
    return { kind: "missing" }
  }

  /// Where posting stands for an operation, from its last attempt.
  postState(operationUuid: string): PostState | undefined {
    if (this.postWork.has(operationUuid)) return { kind: "posting" }
    const failure = this.failures.get(operationUuid)
    const posted = this.posted.get(operationUuid)
    if (failure && (!posted || failure.at >= posted.at)) return { kind: "failed", ...failure }
    return posted ? stateOf(posted) : undefined
  }

  /// Whether a post is due: none is running, none failed in the last
  /// minute, and the last answer is [everyMs] old, or was a refusal of a
  /// call, password or contest since changed.
  due(operationUuid: string, attempt: string, everyMs: number = POST_EVERY_MS): boolean {
    if (this.postWork.has(operationUuid)) return false
    const failure = this.failures.get(operationUuid)
    if (failure && this.deps.now() - failure.at < FAILED_RETRY_MS) return false
    const last = this.posted.get(operationUuid)
    if (!last) return true
    if (!last.answer.ok && last.attempt !== attempt) return true
    const wait = last.answer.auth ? AUTH_REFUSED_WAIT_MS : everyMs - POST_SLACK_MS
    return this.deps.now() - last.at >= wait
  }

  /// Whether this score is the one last posted.
  unchanged(operationUuid: string, signature: string): boolean {
    const last = this.posted.get(operationUuid)
    return !!last?.answer.ok && last.signature === signature
  }

  /// Posts the score in the background. A failure to reach the board, or a
  /// server failing, is no refusal: an assistant call a minute on tries again.
  startPost(request: PostRequest, attempt: string): void {
    // Asked again here: an overlapping assistant call may have posted while
    // this one was gathering the score.
    if (!this.due(request.operationUuid, attempt, request.everyMs) || this.unchanged(request.operationUuid, request.signature)) return
    const work = this.post(request, attempt)
      .catch((error) => {
        const message = messageOf(error)
        this.deps.log(`Live Scoreboard: post failed: ${message}`)
        this.failures.set(request.operationUuid, { at: this.deps.now(), message })
      })
      .finally(() => {
        this.postWork.delete(request.operationUuid)
        this.onChange()
      })
    this.postWork.set(request.operationUuid, work)
  }

  /// The contest's spelling and multiplier types on the board, or undefined
  /// when the board does not take it.
  async rulesFor(contestId: string): Promise<ContestRules | undefined> {
    return rulesFor(await this.contestRules(), contestId)
  }

  private async post(request: PostRequest, attempt: string): Promise<void> {
    const now = this.deps.now()
    const contest = request.headers.CONTEST ?? ""
    const rules = await this.rulesFor(contest)
    if (!rules) {
      this.deps.log(`Live Scoreboard: ${contest || "no contest"} is not among the contests the board takes`)
      this.failures.delete(request.operationUuid)
      this.posted.set(request.operationUuid, {
        at: now,
        signature: request.signature,
        attempt,
        answer: { ok: false, message: "" },
        score: request.totals.score,
        notOnBoard: contest,
      })
      return
    }
    const xml = scoreXml({
      contestId: rules.contestId,
      call: request.call,
      headers: request.headers,
      totals: request.totals,
      multType: rules.multTypes[0],
      qsos: request.qsos,
      breakdown: request.breakdown,
      qth: request.qth,
      soft: request.soft,
      version: request.version,
      now,
    })
    const reply = await this.deps.fetch(POST_URL, {
      method: "POST",
      headers: { Authorization: basicAuth(request.call.toUpperCase(), request.password), "Content-Type": "text/xml; charset=utf-8" },
      body: xml,
      timeout: 20 * 1000,
    })
    const answer = readAnswer(reply.status, reply.body)
    this.deps.log(`Live Scoreboard: ${rules.contestId} ${request.call} ${request.totals.score} → ${reply.status} ${reply.body.slice(0, 200)}`)
    if (answer.transient) throw new Error(answer.message)
    this.failures.delete(request.operationUuid)
    this.posted.set(request.operationUuid, { at: now, signature: request.signature, attempt, answer, score: request.totals.score })
  }
}

function stateOf(posted: Posted): PostState {
  if (posted.answer.ok) return { kind: "posted", at: posted.at, score: posted.score }
  if (posted.notOnBoard !== undefined) return { kind: "notOnBoard", contestId: posted.notOnBoard }
  return { kind: "refused", at: posted.at, message: posted.answer.message, ...(posted.answer.auth ? { auth: true } : {}) }
}
