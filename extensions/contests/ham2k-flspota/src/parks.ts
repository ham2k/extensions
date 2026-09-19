// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Whose reference this is, and which parks each side of a QSO is in.
//
// The event has no exchange of its own (§4.6: a signal report, "with or without
// the park identifier") and logs by POTA number (§3.3: "Use POTA US-xxxx for
// logging"), so the parks are the POTA refs the operator is already logging:
// `potaActivation` on the operation, `pota` on the QSO.

import type { JSONValue } from "@ham2k/extension-sdk"

import { LEGACY_KEY, LEGACY_TYPE, PARKS, TYPE } from "./event.ts"

export const POTA_HUNTING = 'pota'
export const POTA_ACTIVATION = 'potaActivation'

/// Anything carrying `refs` — an operation or a QSO.
type Container = Record<string, JSONValue> | undefined

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function refsOfType(container: Container, type: string): Record<string, JSONValue>[] {
  return (((container?.refs as Record<string, JSONValue>[] | undefined) ?? [])).filter((r) => r?.type === type)
}

/// Whether [ref] is this event's — its own type, or the combined extension's
/// ref naming this event.
///
/// The second half is what every hook has to ask before answering: the scoring
/// scope names `stateparks` so that legacy operations reach this scorer at all,
/// which means the OTHER state-park events' legacy operations reach it too.
export function isOurRef(ref: Record<string, JSONValue> | undefined): boolean {
  if (ref?.type === TYPE) return true
  return ref?.type === LEGACY_TYPE && str(ref.ref).toUpperCase() === LEGACY_KEY
}

/// The event's ref on [operation], in either shape. Its own type wins where
/// both are present: that is the one the operator has set up since.
export function eventRefIn(operation: Container): Record<string, JSONValue> | undefined {
  const refs = (operation?.refs as Record<string, JSONValue>[] | undefined) ?? []
  return refs.find((r) => r?.type === TYPE) ?? refs.find(isOurRef)
}

function references(container: Container, type: string): string[] {
  return [...new Set(refsOfType(container, type).map((r) => str(r.ref).toUpperCase()).filter((r) => r))]
}

/// The listed Florida parks we are operating from. [operation] is the
/// segment-effective one, so a rover's park is the one covering the QSO.
export function ourParks(operation: Container): string[] {
  return references(operation, POTA_ACTIVATION).filter((ref) => PARKS.has(ref))
}

/// Every POTA park the station we worked is in, listed or not.
export function theirParks(qso: Container): string[] {
  return references(qso, POTA_HUNTING)
}

export function isListed(park: string): boolean {
  return PARKS.has(park)
}
