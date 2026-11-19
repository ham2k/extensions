// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Who counts in Sweepstakes, and what section a station is likely in.
//
// Separate from index.ts so these can be unit-tested: index.ts calls
// `defineExtension` at import time, so nothing in it is reachable from
// `node --test`.

import type { JSONValue } from "@ham2k/extension-sdk"
import { annotateCallAgainstCountryFile } from "@ham2k/extension-sdk"
import { parseCallsign } from "@ham2k/lib-callsigns"

import { ALL_SECTIONS, CALL_AREA_FOR_SECTION, PREFIX_TO_LOCATION, STATE_FOR_SECTION } from "./sections.ts"

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/// A section as received, if it is one of the 85; '' otherwise.
export function normalizeSection(value: JSONValue | undefined): string {
  const code = str(value).toUpperCase()
  return code in ALL_SECTIONS ? code : ''
}

/// Whether [call] is a W/VE station by Sweepstakes' reckoning: the US and
/// Canada "including territories and possessions" — Alaska, Hawaii, Puerto
/// Rico, the Virgin Islands and the Pacific possessions all have sections.
/// Sable and St. Paul Islands are DX (the rules' Definitions). A call the
/// country file cannot place gets the benefit of the doubt.
export function isWVE(call: string): boolean {
  const entity = String(annotateCallAgainstCountryFile(call).entityPrefix ?? '')
  return !entity || entity === 'K' || entity === 'VE' || /^K[HLP]/.test(entity)
}

/// The sections that place a station in no one state or province: Puerto Rico
/// and the Virgin Islands are in none, and Territories is Yukon, the Northwest
/// Territories or Nunavut, with nothing to say which.
const NO_STATE_SECTIONS = new Set(['PR', 'VI', 'TER'])

/// The state or province a station's [section] puts them in, for the
/// contact's State; '' where it names none. [current] is the State already
/// on the contact, kept where the section agrees with it but maps elsewhere:
/// MDC is Maryland AND DC, so a DC station keeps DC.
///
/// PAC is Hawaii and the Pacific possessions, so it is Hawaii only for a call
/// the country file doesn't place in a possession (KH0 to KH5, KH8, KH9, each
/// its own entity). It reads Hawaii's own calls as `KH6`, or as plain `K`
/// for some (`AH6`), so the test is "not a possession" rather than "is KH6".
export function stateForSection(section: string, call: string, current: string): string {
  if (!section || NO_STATE_SECTIONS.has(section)) return ''
  if (section === 'MDC' && current === 'DC') return 'DC'
  if (section === 'PAC') {
    const entity = String(annotateCallAgainstCountryFile(call).entityPrefix ?? '')
    if (entity.startsWith('KH') && entity !== 'KH6') return ''
  }
  return STATE_FOR_SECTION[section] ?? section
}

/// A US state or Canadian province, as a lookup reports it, that IS a section
/// — most states are one section each; the rest (California, Florida, New
/// York, Texas…) are split, and give no answer.
const SECTION_FOR_STATE: Record<string, string> = {
  MD: 'MDC', DC: 'MDC', HI: 'PAC', YT: 'TER', NT: 'TER', NU: 'TER',
}

function sectionForState(state: string): string {
  const code = state.toUpperCase()
  return SECTION_FOR_STATE[code] ?? (code in ALL_SECTIONS ? code : '')
}

/// The section the lookup's state is on its own, or '' where the state is
/// split between several, or the lookup found none.
export function lookupSection(their: Record<string, JSONValue>): string {
  const guess = (their.guess as Record<string, JSONValue>) ?? {}
  return sectionForState(str(their.state) || str(guess.state))
}

/// Precomputed: rebuilding this per keystroke costs allocations to answer a
/// question that only depends on one digit.
const SECTIONS_BY_CALL_AREA: Record<number, string[]> = (() => {
  const byArea: Record<number, string[]> = {}
  for (const [section, area] of Object.entries(CALL_AREA_FOR_SECTION)) {
    if (typeof area === 'number') (byArea[area] ??= []).push(section)
  }
  return byArea
})()

/// The sections that are a country file entity each: Alaska, Puerto Rico and
/// the Virgin Islands. Every `KH` entity, Hawaii and the Pacific possessions,
/// is PAC.
const SECTION_FOR_ENTITY: Record<string, string> = { KL: 'AK', KP4: 'PR', KP2: 'VI' }

/// The section [call] names by itself, or ''.
///
/// Alaska, Puerto Rico, the Virgin Islands and the Pacific each go by the
/// country file's entity, so AL7, WL7 and NP4 calls are placed as KL7 and KP4
/// ones are, and a suffix that leaves the station where it is (`/P`) keeps
/// it there. A call moved to another call area (KL7ABC/6) names none: the
/// country file still reads it as Alaska. A Canadian call names its province
/// by its prefix, the one it takes away from home included (VE7/K1ABC): VE7
/// is British Columbia, and VE3 names none, as Ontario is four sections.
export function prefixSection(call: string): string {
  const upper = call.trim().toUpperCase()
  if (!upper) return ''
  const entity = String(annotateCallAgainstCountryFile(upper).entityPrefix ?? '')
  const parsed = parseCallsign(upper)
  if (entity === 'VE') return PREFIX_TO_LOCATION[String(parsed.prefix ?? '')] ?? ''
  const section = SECTION_FOR_ENTITY[entity] ?? (entity.startsWith('KH') ? 'PAC' : '')
  if (!section) return ''
  const home = parseCallsign(String(parsed.baseCall ?? upper)).digit
  return parsed.digit === home ? section : ''
}

/// Sections worth floating to the top of the picker for this station.
///
/// The state a lookup found wins where it is a section on its own; then a
/// prefix that names its section outright (KL7 is Alaska and nothing else);
/// then the US call area, which narrows 85 down to a handful. This only RANKS,
/// as in `fd`: a guess is wrong often enough — a station moved, a club
/// operating away from home — that prefilling it would be worse.
export function preferredSections(their: Record<string, JSONValue>): string[] {
  const guess = (their.guess as Record<string, JSONValue>) ?? {}
  const call = str(their.call).toUpperCase()
  const fromState = lookupSection(their)
  if (fromState) return [fromState]
  if (!call) return []

  const fromPrefix = prefixSection(call)
  if (fromPrefix) return [fromPrefix]
  // A bare digit is a US call area only for a US call: VE3ABC and G3ABC both
  // contain a 3. Canada has no single answer — Ontario alone is four sections.
  const entity = str(their.entityPrefix) || str(guess.entityPrefix) || String(annotateCallAgainstCountryFile(call).entityPrefix ?? '')
  if (entity && entity !== 'K') return []
  const digit = /[0-9]/.exec(call)
  return digit ? SECTIONS_BY_CALL_AREA[Number(digit[0])] ?? [] : []
}
