// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The QSO-party engine: one set of rules, one scorer, one exchange field and
// one submittable file for every party that hands this module a
// `QsoPartyParams`.
//
// An extension for one party is its manifest, its counties and its options —
// `defineQsoParty(params)` answers with everything it registers, so a party
// file states rules and never repeats a hook.

import type {
  ActivityHook,
  AdifFieldsHook,
  ContestScorer,
  ExportHook,
  RefHandlerHook,
  ScoringHook,
  ScoringScope,
} from "@ham2k/extension-sdk"

import type { QsoPartyParams } from "./params.ts"

export type {
  ModeClass,
  OperatorClass,
  OverlayClass,
  PartyEntity,
  PowerClass,
  QsoPartyBonus,
  QsoPartyEntryClasses,
  QsoPartyExchangeFields,
  QsoPartyLocation,
  QsoPartyParams,
  QsoPartyPeriod,
  QsoPartyPointsArgs,
  QsoPartyStanding,
  StationClass,
} from "./params.ts"

/// The scorer's running record. A `type` rather than an `interface`, which is
/// what makes it satisfy the SDK's `Scoresheet` (JSON) constraint: the core
/// snapshots it as a checkpoint, so every field has to be JSON.
export type QsoPartyScoresheet = {
  /// Whether WE are inside the party, and what our entry multiplies by. Both
  /// are recorded from the first QSO scored, because the summary is handed the
  /// BASE operation's ref and a rover's segment may be the only place they are
  /// stated.
  weAreInParty?: boolean
  powerMult?: number
  /// Whether we entered as a mobile or rover station. Once true it stays true:
  /// a rover who parks for an hour is still a rover.
  mobile?: boolean
  /// Multiplier key (band/mode prefix + code) → times claimed. Its SIZE is the
  /// multiplier.
  mults: Record<string, number>
  /// The party's own counties worked, for the checklist the operator reads
  /// while deciding what to chase.
  counties: Record<string, number>
  states: Record<string, number>
  provinces: Record<string, number>
  /// DX entity prefix → contacts, or the single key `DX` where a party counts
  /// every DX station as one multiplier.
  entities: Record<string, number>
  /// The entities a multiplier was actually CREDITED for — what
  /// `dxEntityMultiplierMax` caps, and never the same as `entities` once a
  /// party is at its limit.
  creditedEntities: Record<string, number>
  rareCounties: Record<string, number>
  /// Bonus key (band/mode prefix + callsign) → the points it paid, once.
  bonuses: Record<string, number>
  /// Bonus station callsign → points, regardless of how many band/mode slots
  /// paid: the sweep counts STATIONS.
  bonusStations: Record<string, number>
  /// Our own counties → contacts made from each. What the per-county bonus
  /// counts.
  activatedCounties: Record<string, number>
  /// Callsign → `band|mode|ourCounty` → their counties already credited there.
  worked: Record<string, Record<string, string[]>>
  /// Callsign → the location they last sent, so a second contact with a
  /// station whose exchange went untyped is scored under the county they gave
  /// the first time.
  lastLocation: Record<string, string>
  bands: Record<string, number>
  modes: Record<string, number>
  qsos: number
  points: number
  dupes: number
  dayQsos: number
  dayPoints: number
}

/// Everything one party's extension registers, built from its params.
export interface QsoPartyHooks {
  /// The ref type these hooks answer for — `registerHook('ref:${refType}')`,
  /// and the scoring scope.
  refType: string
  activity: ActivityHook
  refHandler: RefHandlerHook
  adifFields: AdifFieldsHook
  export: ExportHook
  /// Already wrapped by the SDK's `contestScorer`, scoped to `refType`.
  scoring: ScoringHook & { scope: ScoringScope }
}

/// Scores a log under one party's rules: our county against theirs, county
/// lines both ways, bonus stations, sweeps and the power multiplier.
export function qsoPartyScorer(_params: QsoPartyParams): ContestScorer<QsoPartyScoresheet> {
  throw new Error("not implemented")
}

/// The setup form, the exchange field, and the exchange projected into the
/// generic QSON fields the rest of the app reads.
export function qsoPartyActivity(_params: QsoPartyParams): ActivityHook {
  throw new Error("not implemented")
}

/// The ref's own label, subtitle, operation title and rules link.
export function qsoPartyRefHandler(_params: QsoPartyParams): RefHandlerHook {
  throw new Error("not implemented")
}

/// The contest fields one contact contributes to an ADIF file — `CONTEST_ID`,
/// the exchange sent and received, serials and names.
export function qsoPartyAdifFields(_params: QsoPartyParams): AdifFieldsHook {
  throw new Error("not implemented")
}

/// The submittable files: the sponsor's Cabrillo, and a contest ADIF that
/// resolves every exchange the same way the Cabrillo does.
export function qsoPartyExport(_params: QsoPartyParams): ExportHook {
  throw new Error("not implemented")
}

/// One party's whole app-facing surface.
export function defineQsoParty(_params: QsoPartyParams): QsoPartyHooks {
  throw new Error("not implemented")
}
