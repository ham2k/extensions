// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// What the operator declares once per operation — read off the party's ref, in
// one place, so the setup form, the scorer, the ADIF and the Cabrillo cannot
// disagree about what was claimed.
//
// The ref is the segment-effective one wherever a segment may have restated it:
// `location` and `mobile` are what a rover changes when they drive into the
// next county, so the scorer reads them per QSO rather than once per log.

import type { ModeClass, OperatorClass, OverlayClass, PowerClass, StationClass } from "./params.ts"
import type { Party } from "./party.ts"

/// The shared class vocabularies, in the order every party's setup form reads
/// them down: a sponsor names the classes it publishes, and the ORDER is this
/// engine's so that two parties never present the same axis differently.
export const OPERATOR_CLASSES: OperatorClass[] =
  ['SINGLE-OP', 'SINGLE-OP-ASSISTED', 'MULTI-ONE', 'MULTI-TWO', 'MULTI-UNLIMITED']
export const POWER_CLASSES: PowerClass[] = ['QRP', 'LOW', 'HIGH']
export const STATION_CLASSES: StationClass[] =
  ['FIXED', 'MOBILE', 'PORTABLE', 'ROVER', 'EXPEDITION', 'COUNTY-LINE', 'SCHOOL', 'CLUB', 'EOC']
export const MODE_CLASSES: ModeClass[] = ['CW', 'PHONE', 'DIGITAL', 'MIXED']
export const OVERLAY_CLASSES: OverlayClass[] =
  ['ROOKIE', 'YOUTH', 'YL', 'NOVICE-TECH', 'NEW-CONTESTER', 'TB-WIRES', 'POTA']

/// The station classes that are ON THE MOVE — what a party means by "mobile or
/// rover" where it pays a bonus for the counties an entrant activates, and what
/// the old `mobile` flag on a ref stood for.
export const ROVING_STATION_CLASSES: StationClass[] = ['MOBILE', 'ROVER']

export function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/// This party's ref on an operation (or on a QSO), if it has one.
export function refOfType(
  record: Record<string, unknown> | undefined,
  type: string,
): Record<string, unknown> | undefined {
  const refs = (record?.refs as Record<string, unknown>[] | undefined) ?? []
  return refs.find((ref) => ref?.type === type)
}

/// Where we are operating from, as typed — one county, or a county line's two
/// separated by a slash. Not resolved here: `location.ts` owns what the text
/// means, and this is only where it lives.
export function ourLocationText(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): string {
  return str((ref ?? refOfType(operation, party.refType))?.location).trim()
}

/// One declared class, or undefined for a question the operator has not
/// answered — and `undefined` is the answer that means "no claim", not a missing
/// value to be defaulted. A value the party does not publish is refused, so a
/// class left on a ref by an earlier setup cannot be submitted under this one.
function declared<T extends string>(
  ref: Record<string, unknown> | undefined,
  field: string,
  known: readonly T[],
  offered: readonly T[],
): T | undefined {
  const value = str(ref?.[field]).toUpperCase()
  const code = known.find((candidate) => candidate === value)
  return code && offered.includes(code) ? code : undefined
}

/// The entry class we are competing in, for each axis the party publishes.
export function ourOperatorClass(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): OperatorClass | undefined {
  return declared(ref ?? refOfType(operation, party.refType), 'operator', OPERATOR_CLASSES, party.entryClasses.operator)
}

export function ourStationClass(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): StationClass | undefined {
  return declared(ref ?? refOfType(operation, party.refType), 'station', STATION_CLASSES, party.entryClasses.station)
}

export function ourModeClass(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): ModeClass | undefined {
  return declared(ref ?? refOfType(operation, party.refType), 'mode', MODE_CLASSES, party.entryClasses.mode)
}

export function ourOverlayClass(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): OverlayClass | undefined {
  return declared(ref ?? refOfType(operation, party.refType), 'overlay', OVERLAY_CLASSES, party.entryClasses.overlay)
}

export function ourPowerClass(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): PowerClass | undefined {
  return declared(ref ?? refOfType(operation, party.refType), 'power', POWER_CLASSES, party.entryClasses.power)
}

/// What the declared power class multiplies the score by, or 1 — for the six
/// parties that publish a table, and for the entrant who declared a class.
export function powerMultiplier(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): number {
  const power = ourPowerClass(party, operation, ref)
  if (!power) return 1
  return party.powerMultipliers[power] ?? 1
}

/// Whether we are entering as a mobile or rover station. Several parties pay
/// the per-county bonus to rovers only, and one lets a rover count its own
/// county as a multiplier.
///
/// A reading of the STATION class, which is the same question asked properly.
/// The old `mobile` boolean is still honoured — it is on every operation logged
/// before the classes existed, and on anything synced from app-polo.
export function isMobile(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): boolean {
  const own = ref ?? refOfType(operation, party.refType)
  if (own?.mobile === true) return true
  const station = str(own?.station).toUpperCase() as StationClass
  return ROVING_STATION_CLASSES.includes(station) && party.entryClasses.station.includes(station)
}

/// The address a Cabrillo's `EMAIL:` line carries, for the sponsors that ask
/// for one.
export function ourEmail(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): string {
  return str((ref ?? refOfType(operation, party.refType))?.email).trim()
}

/// The name we send, for the parties whose exchange includes one.
export function ourName(
  party: Party,
  operation: Record<string, unknown> | undefined,
  ref?: Record<string, unknown>,
): string {
  return str((ref ?? refOfType(operation, party.refType))?.ourName).trim().toUpperCase()
}
