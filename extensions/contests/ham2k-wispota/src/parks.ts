// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Which Wisconsin park each side of a QSO is in, resolved ONCE for the scorer
// and anything else that asks.
//
// WIPOTA has no exchange field of its own: "The WIPOTA is conducted in all
// Wisconsin parks as defined by the Parks on the Air (POTA) organization", and
// what a park station sends is its US-POTA number. So the parks are read off
// the POTA refs the operator is already logging — `potaActivation` on the
// operation, `pota` on the QSO — the way ham2k-stateparks reads Texas's.
//
// "Wisconsin" is answered from one of two sources, never both:
//   * the ref's own `location`, which POTA's extension copies from the park's
//     `locationDesc` (`US-WI`, or `US-MN,US-WI` for a park on the border). It
//     is POTA's live answer, so a park added after this was built still counts,
//     and where it is present it is the whole answer.
//   * `wi-parks.json`, a snapshot of POTA's Wisconsin list, ONLY for a ref with
//     no `location` — one POTA's extension could not decorate, logged offline
//     or imported — which would otherwise silently score as no park. It never
//     outvotes a `location` naming another state: the snapshot is the older of
//     the two.

import type { JSONValue } from "@ham2k/extension-sdk"

import snapshot from "./wi-parks.json" with { type: "json" }

export const POTA_HUNTING = 'pota'
export const POTA_ACTIVATION = 'potaActivation'

const WISCONSIN = 'US-WI'
const SNAPSHOT = new Set<string>(snapshot.parks)

/// Anything carrying `refs` — an operation or a QSO.
type Container = Record<string, JSONValue> | undefined

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function refsOfType(container: Container, type: string): Record<string, JSONValue>[] {
  return (((container?.refs as Record<string, JSONValue>[] | undefined) ?? [])).filter((r) => r?.type === type)
}

export function refOfType(container: Container, type: string): Record<string, JSONValue> | undefined {
  return refsOfType(container, type)[0]
}

/// Whether a POTA ref names a Wisconsin park.
///
/// `location` is split on commas and compared whole: `US-WI` is a substring of
/// nothing else today, but a prefix match is how `US-WA` would start counting
/// the day someone shortens the constant.
export function isWisconsinPark(ref: Record<string, JSONValue>): boolean {
  const location = str(ref.location).trim()
  if (location) return location.split(',').some((area) => area.trim().toUpperCase() === WISCONSIN)
  return SNAPSHOT.has(str(ref.ref).toUpperCase())
}

/// The first Wisconsin park among [container]'s refs of [type], or `''`.
///
/// ONE park a side, and that is the sponsor's rule rather than a shortcut: "You
/// may operate in only one park at a time", and a new park has to be ten miles
/// from the last. A POTA two-fer — the Ice Age Trail through a state park — is
/// two references at one location, so it is one WIPOTA park, and counting both
/// would claim a second multiplier without the ten miles.
function firstWisconsinPark(container: Container, type: string): string {
  const park = refsOfType(container, type).find(isWisconsinPark)
  return park ? str(park.ref).toUpperCase() : ''
}

/// The Wisconsin park we are operating from, or `''`. [operation] is the
/// segment-effective one the scorer is handed, so a rover's park is the one
/// that covers the QSO.
export function ourPark(operation: Container): string {
  return firstWisconsinPark(operation, POTA_ACTIVATION)
}

/// The Wisconsin park the station we worked is in, or `''` — out-of-state parks
/// included, which "do not earn a multiplier".
export function theirPark(qso: Container): string {
  return firstWisconsinPark(qso, POTA_HUNTING)
}
