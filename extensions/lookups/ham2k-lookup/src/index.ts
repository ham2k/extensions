// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import { defineExtension, host } from "@ham2k/extension-sdk"
import type { AnnotatedCallInfo, HookContext, JSONValue, LookupResult } from "@ham2k/extension-sdk"
import { currentCallAmong, lookupCallRecord, tFor } from "@ham2k/lib-ham2k-calls"

import manifest from "../manifest.json" with { type: "json" }

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    // Below QRZ (99): a QRZ account, when configured, is the more complete
    // and up-to-date source, so this fills gaps QRZ leaves rather than
    // pre-empting it.
    registerHook('lookup', { hook: { lookupCall }, key: manifest.key, priority: 10 })
  },
})

async function fetchCall(call: string): Promise<Record<string, any> | null> {
  // A call containing indicators (e.g. "KI2D/P") 404s — none of that should
  // prevent the baseCall fallback below from still being tried.
  try {
    const response = await host.fetch(`https://services.ham2k.net/lookups/calls/${encodeURIComponent(call)}.json`)
    if (response.status !== 200) return null
    const data = JSON.parse(response.body)
    if (!data || typeof data !== 'object' || data.error) return null
    return data
  } catch (e) {
    host.log(`Ham2K Lookup Service lookup failed for ${call}: ${(e as Error).message ?? e}`)
    return null
  }
}

/**
 * The current call found for each inactive call, by "<FRN> <call>", for as
 * long as the extension runs: looking up the same cancelled call again, or
 * the background queue going through an old log full of them, asks the
 * service once. A failed request is not remembered, so the next lookup tries
 * again.
 */
const CURRENT_CALLS = new Map<string, string | undefined>()

/**
 * The call the holder of an inactive US license uses now: the service lists
 * every license under the same FCC registration number (FRN), which is the
 * holder's, not the license's. Undefined when the record has no FRN (older
 * licenses, and every non-US one) or the holder has no active call.
 */
async function currentCallFor(record: Record<string, unknown>): Promise<string | undefined> {
  const frn = typeof record.frn === 'string' ? record.frn.trim() : ''
  if (!frn || typeof record.call !== 'string') return undefined
  const call = record.call
  const key = `${frn} ${call.toUpperCase()}`
  if (CURRENT_CALLS.has(key)) return CURRENT_CALLS.get(key)
  try {
    const response = await host.fetch(`https://services.ham2k.net/lookups/us-fcc-frn/${encodeURIComponent(frn)}.json`)
    // The listing answers an unknown FRN with 200 and [], so any other status,
    // or a body that is no list, is a fault and not "no current call": it is
    // logged, and not remembered, so the next lookup asks again.
    if (response.status !== 200) {
      host.log(`Ham2K Lookup Service could not find the current call for ${call}: FRN ${frn} answered HTTP ${response.status}`)
      return undefined
    }
    const holderRecords = JSON.parse(response.body)
    if (!Array.isArray(holderRecords)) {
      host.log(`Ham2K Lookup Service could not find the current call for ${call}: FRN ${frn} answered with no list of calls`)
      return undefined
    }
    const current = currentCallAmong(holderRecords, call)
    CURRENT_CALLS.set(key, current)
    return current
  } catch (e) {
    host.log(`Ham2K Lookup Service could not find the current call for ${call}: ${(e as Error).message ?? e}`)
    return undefined
  }
}

/** A non-empty string field (a resolved value, not a blank/absent one). */
const has = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''

async function lookupCall(
  { callInfo }: { callInfo: AnnotatedCallInfo; qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
  ctx: HookContext,
): Promise<LookupResult> {
  const call = (callInfo.call || '').trim().toUpperCase()
  if (call.length < 3 || !ctx.online) return [] // this source needs the network

  // The service answers a US or Canadian record with a grid (never a
  // lat/lon pair, and never a grid for a German one), so — unlike HamDB's
  // equivalent check — skipping the round-trip requires a grid already on
  // the guess as well as a name (+ city/portable scope): there is a grid
  // here worth fetching.
  const isPortable = callInfo.locationScope === 'portable'
  if (has(callInfo.name) && has(callInfo.grid) && (isPortable || has(callInfo.city))) return []

  const answer = await lookupCallRecord(callInfo, fetchCall, 'services.ham2k.net', { t: tFor(ctx), currentCall: currentCallFor })
  // Every answer here took the network (the `!ctx.online` guard above is the
  // only other exit), read generically by the background lookup queue,
  // without knowing this source by name.
  return answer ? [{ ...answer, online: true }] : []
}
