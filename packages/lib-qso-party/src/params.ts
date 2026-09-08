// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// One QSO party, as data: everything the shared engine reads to score a log,
// offer an exchange field and write a submittable file.
//
// A party extension is a manifest and one of these. Nothing here is a lookup
// into a bundled table of 49 parties — each extension carries its own — so the
// two identity fields the app-wide version derives from a party KEY are stated
// outright instead:
//
//   * `refType` is the ref's own `type` (`{type: 'texas-qso-party'}`), where the
//     bundled version carried `{type: 'qp', ref: 'TX'}`. A ref with no `ref`
//     field cannot name a party by key.
//   * `state` is the state or province a county belongs to when nothing else
//     says — the answer the bundled version took from the party key, which no
//     longer exists. Required for that reason: without it a county code short
//     enough to carry no state prefix has no state at all, and the sponsor's own
//     state stops being a multiplier for its entrants.
//
// Every option is optional and every default is stated on the field. A party
// file states the rules its sponsor publishes and nothing else.

import type { JSONValue } from "@ham2k/extension-sdk"

/// Which national county/section vocabulary a party belongs to — `K` for the US
/// parties, `VE` for the Canadian ones. Decides which of the two tables an
/// out-of-area location is looked up in, and which one an in-party station
/// sweeps.
export type PartyEntity = 'K' | 'VE'

export type PowerClass = 'QRP' | 'LOW' | 'HIGH'

/// `operator` and `transmitter` are one axis here and two in Cabrillo:
/// "Multi-Single" is `CATEGORY-OPERATOR: MULTI-OP` with
/// `CATEGORY-TRANSMITTER: ONE`. They are joined because that is how sponsors
/// publish them, and split again on the way into a file.
export type OperatorClass =
  | 'SINGLE-OP'
  | 'SINGLE-OP-ASSISTED'
  | 'MULTI-ONE'
  | 'MULTI-TWO'
  | 'MULTI-UNLIMITED'

export type StationClass =
  | 'FIXED'
  | 'MOBILE'
  | 'PORTABLE'
  | 'ROVER'
  | 'EXPEDITION'
  | 'COUNTY-LINE'
  | 'SCHOOL'
  | 'CLUB'
  | 'EOC'

export type ModeClass = 'CW' | 'PHONE' | 'DIGITAL' | 'MIXED'

export type OverlayClass =
  | 'ROOKIE'
  | 'YOUTH'
  | 'YL'
  | 'NOVICE-TECH'
  | 'NEW-CONTESTER'
  | 'TB-WIRES'
  | 'POTA'

/// One operating period, in UTC millis. A party that runs Saturday and Sunday
/// sessions with a break overnight publishes two: one range spanning the gap
/// would claim hours the sponsor does not score.
export interface QsoPartyPeriod {
  startMillis: number
  endMillis: number
}

/// The classes a party publishes, and so the questions its setup form asks.
/// An axis the sponsor does not classify by is a question the operator is not
/// asked; every list defaults to empty.
export interface QsoPartyEntryClasses {
  operator?: OperatorClass[]
  power?: PowerClass[]
  /// What the sponsor says each power class means — "100 watts", ">150 watts",
  /// "5 watts CW or 10 watts phone". Shown beside the choice, because the class
  /// names are shared across parties and the watts are not.
  powerLimits?: Partial<Record<PowerClass, string>>
  station?: StationClass[]
  mode?: ModeClass[]
  overlay?: OverlayClass[]
}

/// What the entry row asks for besides the location. Both default false.
export interface QsoPartyExchangeFields {
  /// A serial each way (CA, VA).
  number?: boolean
  /// The operator's name each way (MN).
  name?: boolean
}

/// The bonuses won once for the whole log rather than per QSO. All zero unless
/// the sponsor names them.
export interface QsoPartyBonus {
  /// Points for each county we ACTIVATE — a rover's reward for driving.
  /// Default 0.
  perActivatedCounty?: number
  /// QSOs needed from a county before it counts as activated. Default 1.
  perActivatedCountyMinimumCount?: number
  /// Only mobile and rover entrants earn it. Default false.
  perActivatedCountyRoverOnly?: boolean
  /// Points for working every rare county (NC). Default 0.
  rareCountySweep?: number
  /// Rare counties needed for the sweep. Default 0, meaning every county in
  /// `rareCountyMultipliers`.
  rareCountySweepMinimumCount?: number
  /// Points for working every bonus station (ID). Default 0.
  bonusStationSweep?: number
  /// Bonus stations needed for the sweep. Default 0, meaning every station in
  /// `bonusStations`.
  bonusStationSweepMinimumCount?: number
}

/// Both sides' in/out-of-party standing, which several rules turn on. Passed
/// together because resolving one side needs the other's answer.
export interface QsoPartyStanding {
  weAreInParty: boolean
  theyAreInParty: boolean
}

/// A single resolved location — one side of a contact has two of these when it
/// is on a county line.
export interface QsoPartyLocation {
  /// The code as SCORED: a county abbreviation, a state, a province, or `DX`.
  code: string
  /// The key this location adds to the multiplier set, before the per-band or
  /// per-mode prefix. Usually the code itself; a state where a party counts
  /// states rather than counties, and `DX:<prefix>` where each DX entity
  /// multiplies separately.
  multCode: string
  /// What to call it in a notice or a summary — the county's full name, the
  /// state's, or the DX entity's prefix.
  name: string
  /// Whether this is one of the party's OWN counties. "In state" for a party
  /// spanning seven states or three provinces still means "inside the party".
  inParty: boolean
  /// What a submitted file writes for this location, which is not always what
  /// it scores as: under `dxLocationIsPrefix` a DX station is logged by its
  /// entity prefix while still scoring as the single `DX` multiplier.
  sent: string
}

/// What a contact is worth, for a party whose price no table can state.
export interface QsoPartyPointsArgs {
  qso: Record<string, JSONValue>
  band: string
  /// The super-mode — `CW`, `PHONE`, `DATA` — before `dataAndCWCountAsSameMode`
  /// folds digital into CW. Phone is `PHONE`; `SSB` is the Cabrillo header's
  /// spelling and appears nowhere a party's rules are read.
  superMode: string
  /// Our locations and theirs, already resolved. One contact is worth the price
  /// times `ours.length * theirs.length`, so answer the price of ONE pairing.
  ours: QsoPartyLocation[]
  theirs: QsoPartyLocation[]
  weAreInParty: boolean
  theyAreInParty: boolean
}

export interface QsoPartyParams {
  // ---------------------------------------------------------------- identity

  /// The ref type this extension owns, and the `type` of every ref it writes —
  /// `texas-qso-party`. Also the key the scoring hook is scoped to.
  refType: string
  /// The party's full name, as the sponsor writes it: `Texas QSO Party`.
  name: string
  /// The sponsor's short name — `TXQP`, `7QP`, `Salmon Run` — used in labels,
  /// export filenames and the summary's headings.
  short: string
  /// The state or province this party's counties belong to when no other rule
  /// says. Required, and the reason is above: a per-party ref carries no key
  /// for a fallback to read.
  ///
  /// A party spanning several states (7QP, ACQP, CPQP) answers per county
  /// through `stateOfCounty` and states its lead state here.
  state: string
  /// The `CONTEST:` line a submitted Cabrillo carries. Without one no Cabrillo
  /// is offered at all: inventing a name produces a file that looks
  /// submittable and is not.
  cabrilloName?: string
  /// The sponsor's rules page, shown in the setup panel and as the ref's link.
  url?: string
  /// What was verified about this party's data, and when — read by an operator
  /// deciding how far to trust the dates and the county list.
  status?: string
  lastUpdated?: string
  /// Every operating period the sponsor publishes, soonest first. Drives the
  /// activity search's ranking, the setup list's order and the information
  /// panel; an empty list reads as "no dates", never as 1970.
  periods: QsoPartyPeriod[]
  /// The icon and accent color the setup and exchange controls carry — the
  /// extension's own manifest values. Default: neither, which the core renders
  /// as a placeholder glyph with no accent.
  icon?: string
  accentColor?: string

  // ----------------------------------------------------------------- options

  /// Which country's vocabulary the party's own counties sit in. Default `K`.
  entity?: PartyEntity
  /// Stations may operate from two counties at once, so one QSO can count for
  /// both. Only affects what the exchange field ACCEPTS; the scorer multiplies
  /// whatever it is given. Default false.
  countyLine?: boolean
  /// DC is scored as Maryland. Rules saying "50 states" with no mention of DC
  /// mean true; rules naming DC explicitly mean false. Default false.
  dcCountsAsMaryland?: boolean
  /// An in-party station counts its OWN state as a multiplier as well as the
  /// county the contact came from (CO). Default false.
  stateCountsForInState?: boolean
  /// Counties are what an in-party station multiplies by, when working another
  /// in-party station. Default TRUE; the parties that set it false (NEQP,
  /// ACQP, CPQP, DEQP) multiply by STATE instead, and the county stays the
  /// county in the log, the checklist and the Cabrillo either way.
  ///
  /// One option where the bundled version has two — `countiesCountForInState`
  /// and `countiesAreMultForInState`, which its own notes describe identically
  /// and which it reads ANDed. Stated once, positively, so a party file cannot
  /// half-say it.
  countiesAreMultipliersInParty?: boolean
  /// Alaska and Hawaii count as DX rather than as US states. Default false.
  alaskaAndHawaiiAreDX?: boolean
  /// Our own county is a multiplier for us, without working anyone in it.
  /// Default false.
  selfCountsForCounty?: boolean
  /// As `selfCountsForCounty`, but only while operating mobile or rover (TN).
  /// Default false.
  selfMobileCountsForCounty?: boolean
  /// Every DX station together is worth ONE multiplier, `DX`. Default false.
  dxIsMultiplier?: boolean
  /// Each DX entity prefix is its own multiplier. Beats `dxIsMultiplier` where
  /// both are set. Default false.
  dxEntityIsMultiplier?: boolean
  /// Caps how many DX entities may be claimed (7QP, NH, WA: 10; IL: 5). The
  /// cap LIMITS the multiplier; it never erases it. Default undefined,
  /// meaning uncapped.
  dxEntityMultiplierMax?: number
  /// A DX station's logged location is its entity prefix rather than the plain
  /// string `DX`. Default false.
  dxLocationIsPrefix?: boolean
  /// Multipliers count once per band and mode. Default false.
  multsPerBandMode?: boolean
  /// Multipliers count once per band. Default false.
  multsPerBand?: boolean
  /// Multipliers count once per mode. Default false.
  multsPerMode?: boolean
  /// Per-band multipliers for the in-party side only (HI). Default false.
  inStateMultsPerBand?: boolean
  /// Per-band multipliers for the out-of-party side only (NH). Default false.
  outOfStateMultsPerBand?: boolean
  /// A bonus station pays once per band and mode (SC, KY, WI, WV).
  /// Default false.
  bonusPerBandMode?: boolean
  /// A bonus station pays once per mode (the Salmon Run). Default false.
  bonusPerMode?: boolean
  /// Bonus points are added AFTER the multiplier rather than before it.
  /// Default false.
  bonusPostMultiplier?: boolean
  /// Scales a bonus station's points for an in-party entrant. Default 1; ID
  /// sets 0, which is how a party says "the bonus stations pay out-of-state
  /// entrants only".
  bonusStationInStateMult?: number
  /// Scales a bonus station's points for an out-of-party entrant. Default 1.
  bonusStationOutOfStateMult?: number
  /// In-party to out-of-party contacts are worth double (SC). Default false.
  inStateToOutOfStatePointsDouble?: boolean
  /// Digital and CW are one mode for per-mode multipliers, dupes and points.
  /// Default false.
  dataAndCWCountAsSameMode?: boolean
  /// Points for a contact with a station OUTSIDE the party, where the sponsor
  /// prices the two sides differently — Maine pays 2 for a contact with a
  /// Maine station and 1 for anyone else. Default undefined, where the mode
  /// alone sets the price.
  pointsWhenTheyAreOutOfParty?: number
  /// Rover suffixes are stripped from callsigns in the Cabrillo (ID).
  /// Default false.
  removeCountySuffixes?: boolean
  /// What this party calls its subdivisions — CPQP's are Districts. Defaults
  /// `Counties` and `County`.
  labelForCounties?: string
  labelForCounty?: string
  /// The once-per-log bonuses. Every field defaults as documented on
  /// `QsoPartyBonus`; omitting the block pays none of them.
  bonus?: QsoPartyBonus

  // ------------------------------------------------------------------ tables

  /// County abbreviation → name, in the order the summary table prints them
  /// (the sponsor's own, which is alphabetical by name). A party with no
  /// counties has no exchange to check and no multiplier to award.
  counties: Record<string, string>
  /// The neighbouring parties' counties this party's entrants also work (7QP).
  /// Valid exchange values and offered in the picker, but never in-party and
  /// never part of the county sweep. Default `{}`.
  otherCounties?: Record<string, string>
  /// Super-mode (`CW`, `PHONE`, `DATA`) → points for one contact. Default `{}`,
  /// and an unlisted mode is worth 1: no sponsor lists every mode it allows,
  /// and zeroing a contact is a rules claim a missing entry does not make.
  pointsByMode?: Record<string, number>
  /// Callsign → the points working it pays, once per bonus slot. Default `{}`.
  bonusStations?: Record<string, number>
  /// County → the factor a QSO with it is multiplied by (NC). Default `{}`.
  rareCountyMultipliers?: Record<string, number>
  /// Power class → score multiplier for an entrant who declared it. Default
  /// `{}`, and an undeclared class multiplies by 1.
  powerMultipliers?: Partial<Record<PowerClass, number>>
  /// The classes this party publishes. Default: no axis is asked about.
  entryClasses?: QsoPartyEntryClasses
  /// What the entry row asks for besides the location. Default: neither.
  exchange?: QsoPartyExchangeFields

  // --------------------------------------------------------------- overrides
  //
  // A callback answers where a table cannot. Each one returns `undefined` to
  // mean "no opinion", which falls back to the ordinary rule — so a party may
  // override one case and leave the rest alone.

  /// The state or province a county belongs to. Default: a county code longer
  /// than four characters carries its state in its first two (`ORDES` is
  /// Oregon's Deschutes), and anything shorter belongs to `state`. The
  /// multi-state parties answer from their own table here.
  stateOfCounty?: (county: string) => string | undefined

  /// What ONE pairing of our location with theirs is worth, for a sponsor
  /// whose price depends on more than the mode. Default: `pointsByMode`, or
  /// `pointsWhenTheyAreOutOfParty` where that applies.
  pointsForContact?: (args: QsoPartyPointsArgs) => number | undefined

  /// The prefix that makes a multiplier key per-band, per-mode, both or
  /// neither — `'20m:'`, `'20m:CW:'`, `''`. Default: the `mults*` options
  /// above. A party whose multipliers split on something else answers here.
  multiplierKeyPrefix?: (
    args: { band: string; mode: string; weAreInParty: boolean },
  ) => string | undefined

  /// What a bonus station pays US. Default: `bonusStations`, scaled by
  /// `bonusStationInStateMult` / `bonusStationOutOfStateMult`. A party whose
  /// bonus depends on the band, the mode or the callsign's shape answers here.
  bonusForStation?: (args: { call: string; weAreInParty: boolean }) => number | undefined

  /// A whole exchange — one location, or a county line's two — resolved.
  /// Default: the shared resolution, which reads this party's counties, the
  /// states and provinces, and the callsign's entity. A party whose exchange
  /// is not a location at all answers here.
  ///
  /// Answering must be all or nothing for a given exchange: the value returned
  /// is what the scoreboard counts AND what the submitted file writes, and the
  /// two disagreeing is the failure this single seam exists to prevent.
  resolveLocation?: (
    args: { text: string; entityPrefix: string; standing: QsoPartyStanding },
  ) => QsoPartyLocation[] | undefined
}
