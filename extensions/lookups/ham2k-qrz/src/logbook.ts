// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// QRZ.com Logbook pushes, through the `transfer` hook. QRZ issues one API key
// per logbook, so Settings hold a list of them (logbookSettings.ts), and a
// destination is the logbook's callsign as STATUS reports it: a name, never
// the key.

import { host } from "@ham2k/extension-sdk"
import type { DestinationsRequest, HookContext, PushRecord, PushRecordResult, PushSuggestion, PushSuggestionsRequest, TransferDestination } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.ts"
import { logbookEntriesOf } from "./logbookSettings.ts"
import type { PullRequest, PullResult } from "./sdkGap.ts"

const API = "https://logbook.qrz.com/api"

export const SERVICE = "qrz"

/// The logbook keys the operator entered. Throws when they cannot be read,
/// so the push rows say so rather than offering nothing.
export function logbookKeysOf(ctx: HookContext): string[] {
  const entries = logbookEntriesOf(ctx)
  if (entries === undefined) throw new Error(tFor(ctx)("keychainUnavailable"))
  return entries.map((entry) => entry.key)
}

/// QRZ metadata looks like `RESULT=OK&LOGID=123&COUNT=1`. Values can use
/// form encoding or contain a literal %, so keep the original on decode failure.
export function parseReply(body: string): Record<string, string> {
  const decode = (text: string): string => {
    try {
      return decodeURIComponent(text.replace(/\+/g, " "))
    } catch {
      return text
    }
  }
  const reply: Record<string, string> = {}
  for (const pair of body.trim().split("&")) {
    const at = pair.indexOf("=")
    if (at <= 0) continue
    reply[decode(pair.slice(0, at)).toUpperCase()] = decode(pair.slice(at + 1))
  }
  return reply
}

const htmlEntities: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
}

function decodeHtmlPayload(adif: string): string {
  return adif.replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (_, name: string) => {
    if (name[0] !== "#") return htmlEntities[name.toLowerCase()]
    const point = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    if (point > 0x10ffff) throw new Error("Invalid QRZ ADIF entity")
    return String.fromCodePoint(point)
  })
}

function parseFetchReply(body: string): Record<string, string> {
  // The live API appends ADIF after the metadata. Ampersands, plus signs
  // and percent signs in that document are data, including literal entities.
  const marker = /(?:^|&)ADIF=/i.exec(body)
  if (!marker) return parseReply(body)
  const tail = body.slice(marker.index + marker[0].length)
  const opening = /<|&lt;|%3c|%26lt%3b/i.exec(tail)?.[0]
  if (opening?.startsWith("%")) return parseReply(body)
  return { ...parseReply(body.slice(0, marker.index)), ADIF: tail }
}

async function call(params: Record<string, string>): Promise<Record<string, string>> {
  const body = Object.entries(params)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&")
  const response = await host.fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (response.status !== 200) throw new Error(`QRZ.com Logbook answered HTTP ${response.status}`)
  return params.ACTION === "FETCH" ? parseFetchReply(response.body) : parseReply(response.body)
}

export type Logbook = { call: string; name?: string }

/// QRZ.com answered, and refused the key: unlike a request that never got an
/// answer, asking again changes nothing.
export class KeyRefused extends Error {}

/// The logbook [key] opens; [KeyRefused] with QRZ's reason when it opens
/// none, any other error when QRZ could not be asked. STATUS may carry its
/// fields in a nested, form-encoded `DATA`; both shapes are read.
export async function logbookStatus(key: string): Promise<Logbook> {
  const reply = await call({ KEY: key, ACTION: "STATUS" })
  const data = { ...reply, ...(reply.DATA ? parseReply(reply.DATA) : {}) }
  const callsign = data.CALLSIGN ?? data.OWNER
  if (reply.RESULT !== "OK" || !callsign) throw new KeyRefused(reply.REASON ?? "QRZ.com did not accept this logbook key")
  return { call: callsign.toUpperCase(), name: data.BOOK_NAME?.trim() || undefined }
}

/// Enough of a key to tell it from the others, and no more.
export const shortKey = (key: string) => `${key.slice(0, 4)}…`

/// Why [key] opens no logbook: refused by QRZ.com, or not checked at all.
export const statusFailure = (key: string, e: unknown, t: ReturnType<typeof tFor>): string =>
  t(e instanceof KeyRefused ? "logbookFailed" : "logbookUnchecked", { key: shortKey(key), message: (e as Error).message })

/// A logbook as QRZ.com shows it: by its name, which is its callsign until
/// the operator renames it.
export const logbookLabel = ({ call, name }: Logbook, t: ReturnType<typeof tFor>): string => t("logbookNamed", { name: name ?? call })

/// Logbook callsign → its key and name, learned by asking STATUS of every
/// key the operator entered. Kept for the life of the runtime and learned
/// again when the keys change, or after a key could not be checked.
const logbooks = new Map<string, Logbook & { key: string }>()
/// Why each key that opened no logbook did not, for a push to a logbook none
/// opened: "no key for it" would be untrue of a key QRZ.com refused or could
/// not be asked about.
const failures = new Map<string, unknown>()
let learnedFrom: string | undefined

async function logbookMap(ctx: HookContext): Promise<Map<string, Logbook & { key: string }>> {
  const keys = logbookKeysOf(ctx)
  if (learnedFrom === keys.join(" ")) return logbooks
  logbooks.clear()
  failures.clear()
  let complete = true
  for (const key of keys) {
    try {
      const logbook = await logbookStatus(key)
      logbooks.set(logbook.call, { ...logbook, key })
    } catch (e) {
      // Not a destination; a push to the logbook it should have opened says
      // why. Asked again next time either way: a key reset on QRZ.com is
      // refused until the operator enters the new one.
      failures.set(key, e)
      complete = false
    }
  }
  learnedFrom = complete ? keys.join(" ") : undefined
  return logbooks
}

const logbookFor = async (call: string, ctx: HookContext) => (await logbookMap(ctx)).get(call)

/// A logbook for each station call one of the account's keys opens. A call
/// with none is usually another operator's, who takes their own files, so it
/// is left out rather than reported.
export async function suggestDestinations({ stationCalls }: DestinationsRequest, ctx: HookContext): Promise<TransferDestination[]> {
  if (logbookKeysOf(ctx).length === 0) return []
  const t = tFor(ctx)
  const books = await logbookMap(ctx)
  return stationCalls.flatMap((raw) => {
    const call = raw.toUpperCase()
    const logbook = books.get(call)
    return logbook ? [{ id: call, label: logbookLabel(logbook, t), stationCall: call }] : []
  })
}

export async function suggestPushes({ scope, sent }: PushSuggestionsRequest, ctx: HookContext): Promise<PushSuggestion[]> {
  if (logbookKeysOf(ctx).length === 0) return []
  const t = tFor(ctx)
  const finished = scope.kind === "operation" && ["completed", "processed"].includes(String(scope.operation.status ?? ""))
  const pushed = Object.keys(sent ?? {}).some((key) => key.startsWith(`${SERVICE}:`))
  return [
    {
      key: "new",
      service: SERVICE,
      label: t("pushToLogbook"),
      payload: { full: true },
      select: { notSentTo: SERVICE },
      emphasis: finished && !pushed ? "due" : undefined,
    },
    {
      key: "updates",
      service: SERVICE,
      label: t("pushUpdatesToLogbook"),
      payload: { full: true },
      select: { changedSince: SERVICE },
      emphasis: "updates",
    },
  ]
}

/// One contact at a time, in order: QRZ takes one ADIF record per INSERT, and
/// a contact sent before is removed first, since REPLACE matches a changed
/// contact to nothing and would leave the old one beside the new.
export async function push(
  { destination, records }: { destination: TransferDestination; records: PushRecord[] },
  ctx: HookContext,
): Promise<PushRecordResult[]> {
  const key = (await logbookFor(destination.id, ctx))?.key
  if (!key) {
    const t = tFor(ctx)
    const [failed] = failures
    throw new Error(failed ? statusFailure(failed[0], failed[1], t) : t("noLogbookFor", { call: destination.id }))
  }
  const results: PushRecordResult[] = []
  for (const record of records) {
    try {
      if (record.id) await remove(key, record.id)
      if (record.deleted) {
        results.push({ uuid: record.uuid })
        continue
      }
      let id: string | undefined
      for (const adif of record.adif) {
        const reply = await call({ KEY: key, ACTION: "INSERT", OPTION: "REPLACE", ADIF: adif })
        if (reply.RESULT !== "OK" && reply.RESULT !== "REPLACE") throw new Error(reply.REASON ?? `QRZ.com answered ${reply.RESULT ?? "nothing"}`)
        id ??= reply.LOGID
      }
      results.push({ uuid: record.uuid, id })
    } catch (e) {
      results.push({ uuid: record.uuid, error: (e as Error).message })
    }
  }
  return results
}

/// A contact already gone from the logbook is not a failure: what was asked
/// for is true.
async function remove(key: string, id: string): Promise<void> {
  const reply = await call({ KEY: key, ACTION: "DELETE", LOGIDS: id })
  if (reply.RESULT === "OK" || reply.RESULT === "PARTIAL") return
  if (/not found|no such/i.test(reply.REASON ?? "")) return
  throw new Error(reply.REASON ?? `QRZ.com answered ${reply.RESULT ?? "nothing"}`)
}

/// Contacts per FETCH: QRZ.com caps a page, and a whole logbook comes back
/// a page at a time, each after the highest LOGID of the one before.
const PAGE = 250
/// A logbook of this many pages is taken to be a reply that never ends.
const MAX_PAGES = 1000
const ID_FIELD = "app_qrzlog_logid"

function adifValueBounds(
  adif: string, start: number, length: number, preferCharacters: boolean, atBoundary: (index: number) => boolean,
): { end: number; bytes: number } {
  const characterEnd = start + length
  const characterBoundary = atBoundary(characterEnd)
  let end = start
  let bytes = 0
  let characters = 0
  let characterBytes = 0
  while (end < adif.length && characters < length) {
    const point = adif.codePointAt(end)!
    if (point < 0x80) bytes += 1
    else if (point < 0x800) bytes += 2
    else if (point < 0x10000) bytes += 3
    else bytes += 4
    end += point > 0xffff ? 2 : 1
    characters++
    if (!(preferCharacters && characterBoundary) && bytes === length && atBoundary(end)) return { end, bytes }
    if (end <= characterEnd) characterBytes = bytes
    if (end === characterEnd && characterBoundary) return { end, bytes }
  }
  // A field can also count Unicode code points, so a supplementary
  // character counts as one even though it occupies two UTF-16 units.
  if (characters === length && atBoundary(end)) return { end, bytes }
  return { end: characterEnd, bytes: characterBytes }
}

type AdifEncoding = "plain" | "escapedTags" | "decodedPayload"
const TAG_BODY = String.raw`(?:(EOH|EOR)|([a-z][a-z0-9_]*):(\d+)(:[a-z])?)`
const FIRST_ADIF_TAG = new RegExp(`<${TAG_BODY}>|&lt;${TAG_BODY}&gt;`, "i")
const ADIF_SPACE = " \t\n\r"

function fetchRecords(
  adif: string, count: number | undefined, t: ReturnType<typeof tFor>, preferCharacters: boolean, encoding: AdifEncoding,
): Map<number, string> {
  const escapedTags = encoding === "escapedTags"
  const pattern = escapedTags ? `&lt;${TAG_BODY}&gt;` : `<${TAG_BODY}>`
  const tags = new RegExp(pattern, "gi")
  const nextTag = new RegExp(pattern, "iy")
  function atBoundary(index: number): boolean {
    if (encoding === "plain") return index === adif.length || (index < adif.length && (adif[index] === "<" || ADIF_SPACE.includes(adif[index])))
    // Require a tag after any separator whitespace. Otherwise a field's
    // declared length can appear to end on whitespace inside its value.
    while (index < adif.length && ADIF_SPACE.includes(adif[index])) index++
    nextTag.lastIndex = index
    return index === adif.length || nextTag.test(adif)
  }
  const records = new Map<number, string>()
  let start = 0
  const parts: string[] = []
  let sawHeader = false
  let id: number | undefined
  let lastField: string | undefined
  function malformed(detail: string): never {
    throw new Error(t("pullAdifDetails", { detail, record: records.size + 1, count: count ?? "—", size: adif.length }))
  }
  for (let tag = tags.exec(adif); tag; tag = tags.exec(adif)) {
    const name = (tag[1] ?? tag[2]).toLowerCase()
    if (name === "eoh") {
      if (sawHeader || records.size > 0) malformed(t("pullAdifUnexpectedHeader"))
      sawHeader = true
      start = tags.lastIndex
      parts.length = 0
      lastField = undefined
      id = undefined
    } else if (name === "eor") {
      if (id === undefined) malformed(t("pullAdifMissingId"))
      if (records.has(id)) malformed(t("pullAdifRepeatedId"))
      if (escapedTags) parts.push(adif.slice(start, tag.index), `<${tag[1]}>`)
      else parts.push(adif.slice(start, tags.lastIndex))
      records.set(id, parts.join(""))
      start = tags.lastIndex
      parts.length = 0
      lastField = undefined
      id = undefined
    } else {
      const length = Number(tag[3])
      const field = name.toUpperCase().slice(0, 32)
      const { end, bytes } = adifValueBounds(adif, tags.lastIndex, length, preferCharacters, atBoundary)
      if (end > adif.length) malformed(t("pullAdifTruncatedField", { field, length, remaining: adif.length - tags.lastIndex }))
      if (encoding !== "plain" && !atBoundary(end)) malformed(t("pullAdifFieldBoundary", { field }))
      const value = adif.slice(tags.lastIndex, end)
      if (name === ID_FIELD) {
        if (id !== undefined) malformed(t("pullAdifTwoIdFields"))
        id = Number(value)
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0) malformed(t("pullAdifInvalidId"))
      }
      // HaLo decodes entities in each field after tokenizing. Protect literal
      // entities for that pass and write the resulting UTF-8 byte length.
      const protectedValue = value.replace(/&(?=(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
      if (escapedTags || bytes !== length || protectedValue !== value) {
        const outputLength = bytes + protectedValue.length - value.length
        parts.push(adif.slice(start, tag.index), `<${tag[2]}:${outputLength}${tag[4] ?? ""}>`, protectedValue)
        start = end
      }
      // A field's data can itself contain strings like <EOR>.
      tags.lastIndex = end
      lastField = field
    }
  }
  if (lastField) malformed(t("pullAdifMissingEnd", { field: lastField }))
  if (records.size === 0 && adif.slice(start).trim()) malformed(t("pullAdifUnrecognized"))
  return records
}

async function readPage(
  reply: Record<string, string>, key: string, options: string[], after: number, t: ReturnType<typeof tFor>,
): Promise<Map<number, string>> {
  const adif = reply.ADIF ?? ""
  const count = /^\d+$/.test(reply.COUNT ?? "") ? Number(reply.COUNT) : undefined
  const candidates: Map<number, string>[] = []
  const failures: string[] = []
  function scan(data: string, encoding: AdifEncoding) {
    // Prefer character lengths. Check the UTF-8 reading as well when they
    // can differ and use the page's record IDs to resolve disagreements.
    for (const preferCharacters of /[^\x00-\x7f]/.test(data) ? [true, false] : [true]) {
      try {
        const batch = fetchRecords(data, count, t, preferCharacters, encoding)
        if (batch.size > PAGE || (batch.size === 0 && count !== 0) || (count !== undefined && count < batch.size)) {
          throw new Error(t("pullInvalidCount", { count: count ?? "—", records: batch.size }))
        }
        if (after > 0 && (!batch.has(after) || [...batch.keys()].some((id) => id < after))) {
          throw new Error(t("pullInvalidContinuation"))
        }
        candidates.push(batch)
      } catch (error) {
        if (!(error instanceof Error)) throw error
        failures.push(error.message)
      }
    }
  }
  const escapedTags = FIRST_ADIF_TAG.exec(adif)?.[0].startsWith("&") ?? false
  scan(adif, escapedTags ? "escapedTags" : "plain")
  // A fully escaped document needs one transport decode before its declared
  // lengths line up. Try it only if the verbatim field boundaries fail.
  if (escapedTags && candidates.length === 0) scan(decodeHtmlPayload(adif), "decodedPayload")
  const [chosen, alternate] = candidates
  if (!chosen) throw new Error([...new Set(failures)].join(" / "))
  const idsAgree = !alternate || (chosen.size === alternate.size && [...chosen.keys()].every((id) => alternate.has(id)))
  if (idsAgree && (count === undefined || chosen.size === Math.min(count, PAGE))) return chosen

  // A plausible record boundary alone can't settle which IDs belong to
  // this page. Ask QRZ for the IDs without ADIF using the same selection.
  const index = await call({ KEY: key, ACTION: "FETCH", OPTION: ["TYPE:LOGIDS", ...options.slice(1)].join(",") })
  const ids = index.LOGIDS?.split(",").map((part) => {
    const id = part.trim()
    return /^\d+$/.test(id) ? Number(id) : NaN
  }) ?? []
  if (index.RESULT !== "OK" || !ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error(t("pullCannotVerifyIds"))
  }
  const verified = candidates.find((batch) => batch.size === ids.length && ids.every((id) => batch.has(id)))
  if (!verified) throw new Error(t("pullIdListMismatch", { count: ids.length }))
  return verified
}

/// The day [millis] falls on, as FETCH's MODSINCE reads it.
const day = (millis: number) => new Date(millis).toISOString().slice(0, 10)

/// What [destination]'s logbook holds: everything, or what changed since
/// [cursor], the day the last pull imported here started. That day is read
/// again, so a contact changed while the last pull ran is never missed; the
/// app finds the rest unchanged.
export async function pull({ destination, cursor }: PullRequest, ctx: HookContext): Promise<PullResult> {
  const t = tFor(ctx)
  const key = (await logbookFor(destination.id, ctx))?.key
  if (!key) {
    const [failed] = failures
    throw new Error(failed ? statusFailure(failed[0], failed[1], t) : t("noLogbookFor", { call: destination.id }))
  }
  const startedOn = day(Date.now())
  const records: string[] = []
  let after = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const options = ["TYPE:ADIF", `MAX:${PAGE}`, `AFTERLOGID:${after}`, ...(cursor ? [`MODSINCE:${cursor}`] : [])]
    try {
      const reply = await call({ KEY: key, ACTION: "FETCH", OPTION: options.join(",") })
      const reason = reply.REASON?.trim()
      if (reply.RESULT !== "OK") {
        // An empty logbook or no changes since the cursor can return FAIL.
        // A rejected request can also return zero, so require an explicit
        // no-match reason before treating FAIL as an empty selection.
        if (after === 0 && reply.RESULT === "FAIL" && reply.COUNT === "0" && !reply.ADIF?.trim() &&
            /^no log entries found[.!]?$/i.test(reason ?? "")) {
          return { format: "adif", content: "<EOH>\n", cursor: startedOn, idField: ID_FIELD }
        }
        const result = /^[A-Z]+$/.test(reply.RESULT ?? "") ? reply.RESULT : t("pullMissingResult")
        const count = /^\d+$/.test(reply.COUNT ?? "") ? `, COUNT=${reply.COUNT}` : ""
        throw new Error(t("pullRejected", { result, count, reason: reason ? ` (${reason})` : "" }))
      }
      const batch = await readPage(reply, key, options, after, t)
      // AFTERLOGID is inclusive. Keep one overlapping record so a logbook
      // ending on a full page can finish with an unambiguous short page.
      const fetched = batch.size
      batch.delete(after)
      for (const record of batch.values()) records.push(record)
      if (fetched < PAGE) return { format: "adif", content: `<EOH>\n${records.join("\n")}`, cursor: startedOn, idField: ID_FIELD }
      after = Math.max(...batch.keys())
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replaceAll(key, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 300)
      throw new Error(t("pullFetchFailed", { page: page + 1, message }))
    }
  }
  throw new Error(t("pullPageLimit", { pages: MAX_PAGES }))
}

