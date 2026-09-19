// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Ohio State Parks On The Air — what the sponsor's rules state, as data. Quotes
// are the "OSPOTA Official Contest Rules", January 2026 - Rev 1
// (https://ospota.org/wp-content/uploads/2026/01/OSPOTA-Rules-2026-Rev-1.pdf),
// which has headings rather than section numbers.

import parks from "./parks.json" with { type: "json" }

/// The ref type an operation stores — and a QSO, for the park it was sent. It is
/// data in the operator's log, so it never follows a rename of the package.
export const TYPE = 'ohspota'

/// What an operation logged under the combined State Parks extension carries:
/// `{type: 'stateparks', ref: 'OHSP'}`, and `{type: 'stateparks', park: 'ADA'}`
/// on its QSOs. Those are not migrated — a log is not an extension's to edit
/// after the fact — so every read reaches back for one, and the manifest, the
/// setup control and the runtime each state the claim (`ref:stateparks/ohsp`,
/// the app's docs/extensions/README.md).
export const LEGACY_TYPE = 'stateparks'
export const LEGACY_KEY = 'OHSP'
export const LEGACY_CLAIM = `${LEGACY_TYPE}/${LEGACY_KEY.toLowerCase()}`

/// As the sponsor's rules title it. Not translated: it is a proper name.
export const NAME = 'Ohio State Parks On The Air'
export const URL = 'https://ospota.org/'

/// The sponsor's Cabrillo `CONTEST:` name. Not the ADIF `CONTEST_ID`, which
/// stays the key the combined extension wrote: two vocabularies, kept apart.
export const CABRILLO_NAME = 'OSPOTA'

/// "First Saturday after the Labor Day holiday - 1400 UTC to 2200 UTC": the 19th
/// OSPOTA, September 12, 2026. The manifest's `relevance.dates` has to move with
/// these.
export const START_MILLIS = Date.UTC(2026, 8, 12, 14, 0)
export const END_MILLIS = Date.UTC(2026, 8, 12, 22, 0)

/// "Amateur Radio Bands: 80, 40, 20, 15 and 10 meters."
export const BANDS = ['80m', '40m', '20m', '15m', '10m']

/// "Stations inside an Ohio State Park must make a minimum of TEN contacts. Four
/// of the contacts being made to four other … Ohio State Park stations." A
/// condition on the ENTRY, which the summary states; it changes no QSO's worth.
export const MIN_CONTACTS = 10
export const MIN_OTHER_PARKS = 4

/// What a station in Ohio but in no park sends, and what goes in a Cabrillo
/// location column for one: "Ohio stations NOT operating from an Ohio State Park
/// send their call sign and 'NOT'."
export const NOT_IN_A_PARK = 'NOT'

/// One park in the "OSPOTA State Park Identifier List": the three-letter
/// identifier stations exchange, and the POTA reference it corresponds to.
export interface Park { abbreviation: string; ref: string; name: string }

/// In the sponsor's own order, alphabetical by identifier.
export const PARKS: Park[] = parks

export const PARK_BY_ABBREVIATION: Record<string, Park> = {}
export const PARK_BY_REF: Record<string, Park> = {}
for (const park of PARKS) {
  PARK_BY_ABBREVIATION[park.abbreviation] = park
  if (park.ref) PARK_BY_REF[park.ref] = park
}

/// A power class: the value stored on our ref, and the sponsor's bounds for it.
/// The watts are not translated: an operator checking which class they are in
/// wants the rule book's figure.
export interface PowerClass { value: string; watts: string }

/// "Low Power = .1 to 100 watts / High Power = Greater than 100 watts". The
/// values are the ones the combined extension stored as `ourPower`.
export const POWER_CLASSES: PowerClass[] = [
  { value: 'LP', watts: '0.1–100W' },
  { value: 'HP', watts: '>100W' },
]

/// One entry category as the sponsor publishes it.
export interface EntryCategory {
  /// The code their Cabrillo expects in `CATEGORY-OPERATOR`.
  value: string
  /// Not translated: it is the sponsor's taxonomy, and the operator is picking
  /// the line they read in the rule book.
  description: string
  /// `CATEGORY-TRANSMITTER`, where the category settles it. Undefined for the
  /// two whose own definition says "(Single or Multi)" of OPERATORS and names no
  /// transmitter count — those get no header rather than a guess.
  transmitter?: 'SINGLE' | 'MULTI'
  /// `CATEGORY-POWER`, where the category settles it: six of the nine codes end
  /// in L or H and so name the power themselves.
  power?: 'LOW' | 'HIGH'
}

/// The nine "Entry Categories". Single-operator first, where the rules list
/// multi-op first: this is a picker, and one entrant in a park on their own is
/// the common case. Descriptions are kept SHORT — the sponsor's own sentences are
/// long enough to be truncated where it matters, and the wattages are on the
/// Power field right above.
export const CATEGORIES: EntryCategory[] = [
  { value: 'SL', description: 'Single Op, Low Power', transmitter: 'SINGLE', power: 'LOW' },
  { value: 'SH', description: 'Single Op, High Power', transmitter: 'SINGLE', power: 'HIGH' },
  { value: 'MSL', description: 'Multi-Op, Single TX, Low Power', transmitter: 'SINGLE', power: 'LOW' },
  { value: 'MSH', description: 'Multi-Op, Single TX, High Power', transmitter: 'SINGLE', power: 'HIGH' },
  { value: 'MML', description: 'Multi-Op, Multi-TX, Low Power', transmitter: 'MULTI', power: 'LOW' },
  { value: 'MMH', description: 'Multi-Op, Multi-TX, High Power', transmitter: 'MULTI', power: 'HIGH' },
  // Its transmitter count is in the definitions rather than the code: "using
  // only one transmitter operating at multiple Ohio State Parks (one at a
  // time)". It says nothing about power.
  { value: 'MPO', description: 'Multi-Park Operator(s)', transmitter: 'SINGLE' },
  { value: 'INOH', description: 'Inside Ohio, not at a state park' },
  { value: 'OUT', description: 'Outside Ohio' },
]

/// The mode a contact is counted under, or `''` for one the contest does not
/// have: "Modes of Operation: SSB and CW only (no RTTY, FT8 or other digital
/// modes)."
export function slotMode(mode: string): '' | 'CW' | 'SSB' {
  const upper = mode.toUpperCase()
  if (upper === 'CW') return 'CW'
  return upper === 'SSB' || upper === 'USB' || upper === 'LSB' ? 'SSB' : ''
}
