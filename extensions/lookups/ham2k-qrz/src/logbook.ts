// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// QRZ.com Logbook pushes, through the `transfer` hook. QRZ issues one API key
// per logbook, so the account holds a list of them, and a destination is the
// logbook's callsign as STATUS reports it: a name, never the key.

import { host } from "@ham2k/extension-sdk"
import type { DestinationsRequest, HookContext, PushRecord, PushRecordResult, PushSuggestion, PushSuggestionsRequest, TransferDestination } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.ts"

const API = "https://logbook.qrz.com/api"

export const SERVICE = "qrz"

/// The logbook keys the operator entered, separated by spaces, commas or lines.
export function logbookKeysOf(ctx: HookContext): string[] {
  const raw = ctx.account?.credentials?.logbookKeys ?? ""
  return raw
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter((key) => key !== "")
}

/// QRZ answers `RESULT=OK&LOGID=123&COUNT=1`, form-encoded.
export function parseReply(body: string): Record<string, string> {
  const reply: Record<string, string> = {}
  for (const pair of body.trim().split("&")) {
    const at = pair.indexOf("=")
    if (at <= 0) continue
    const decode = (text: string) => decodeURIComponent(text.replace(/\+/g, " "))
    reply[decode(pair.slice(0, at)).toUpperCase()] = decode(pair.slice(at + 1))
  }
  return reply
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
  return parseReply(response.body)
}

export type Logbook = { call: string; name?: string }

/// The logbook [key] opens, or an error naming QRZ's reason. STATUS may
/// carry its fields in a nested, form-encoded `DATA`; both shapes are read.
export async function logbookStatus(key: string): Promise<Logbook> {
  const reply = await call({ KEY: key, ACTION: "STATUS" })
  const data = { ...reply, ...(reply.DATA ? parseReply(reply.DATA) : {}) }
  const callsign = data.CALLSIGN ?? data.OWNER
  if (reply.RESULT !== "OK" || !callsign) throw new Error(reply.REASON ?? "QRZ.com did not accept this logbook key")
  return { call: callsign.toUpperCase(), name: data.BOOK_NAME?.trim() || undefined }
}

/// A logbook as QRZ.com shows it: by its name, which is its callsign until
/// the operator renames it.
export const logbookLabel = ({ call, name }: Logbook, t: ReturnType<typeof tFor>): string => t("logbookNamed", { name: name ?? call })

/// Logbook callsign → its key and name, learned by asking STATUS of every
/// key the account holds. Kept for the life of the runtime and learned again
/// when the keys change, or after a key could not be checked.
const logbooks = new Map<string, Logbook & { key: string }>()
let learnedFrom: string | undefined

async function logbookMap(ctx: HookContext): Promise<Map<string, Logbook & { key: string }>> {
  const keys = logbookKeysOf(ctx)
  if (learnedFrom === keys.join(" ")) return logbooks
  logbooks.clear()
  let complete = true
  for (const key of keys) {
    try {
      const logbook = await logbookStatus(key)
      logbooks.set(logbook.call, { ...logbook, key })
    } catch {
      // A key QRZ refuses opens no logbook, and the account test names it;
      // one it could not be asked about is asked again next time.
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
  if (!key) throw new Error(tFor(ctx)("noLogbookFor", { call: destination.id }))
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
