// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Florida State Parks on the Air — what the sponsor's rules state, as data.
// Section numbers are the "2026 FSPOTA Rules v.1.3"
// (https://fspota.org/wp-content/uploads/2026_FL_POTA_Rules_v_1_3.pdf).

import parks from "./parks.json" with { type: "json" }

/// The ref type an operation stores. It is data in the operator's log, so it
/// never follows a rename of the package.
export const TYPE = 'flspota'

/// What an operation logged under the combined State Parks extension carries:
/// `{type: 'stateparks', ref: 'FLSP'}`. Those are not migrated — a log is not
/// an extension's to edit after the fact — so every read reaches back for one,
/// and the manifest, the setup control and the runtime each state the claim
/// (`ref:stateparks/flsp`, the app's docs/extensions/README.md).
export const LEGACY_TYPE = 'stateparks'
export const LEGACY_KEY = 'FLSP'
export const LEGACY_CLAIM = `${LEGACY_TYPE}/${LEGACY_KEY.toLowerCase()}`

/// As the sponsor writes it. Not translated: it is a proper name.
export const NAME = 'Florida State Parks on the Air'
export const URL = 'https://fspota.org/'

/// §2: "1200 UTC, April 17, to 2359 UTC, April 20", 2026. The manifest's
/// `relevance.dates` has to move with these.
export const START_MILLIS = Date.UTC(2026, 3, 17, 12, 0)
export const END_MILLIS = Date.UTC(2026, 3, 20, 23, 59)

/// §4.2: "Bands allowed for the contest are: 160, 80/75, 40, 20, 15, 10, and 6m."
export const BANDS = ['160m', '80m', '40m', '20m', '15m', '10m', '6m']

/// §6.1.2: "10 or more QSOs must be made from the park to consider it activated."
export const QSOS_TO_ACTIVATE = 10

/// §6.1.3, the "Per Park Bonus": "100 points for each park activated during the
/// entire event. May only be claimed once for any given park".
///
/// The other two bonuses — first-time activator and youth operator, 100 each —
/// are claimed on the sponsor's upload form and rest on facts no log holds, so
/// the score here is the part a log can support.
export const POINTS_PER_PARK_ACTIVATED = 100

/// §3.1: the "Official Florida State Parks on the Air List", as POTA references.
export const PARKS: ReadonlySet<string> = new Set(parks)

/// §6.1.1: "1 point for each SSB or Digital QSO and 2 points for each CW QSO".
export function pointsForMode(mode: string): number {
  return mode === 'CW' ? 2 : 1
}

/// The mode a contact is counted under. §4.5: "Each mode (FT8, FT4, RTTY, etc.)
/// counts as a separate contact" — modes, not the PHONE/CW/DATA families the
/// other contests fold them into. The sidebands are one mode.
export function slotMode(mode: string): string {
  const upper = mode.toUpperCase()
  return upper === 'USB' || upper === 'LSB' ? 'SSB' : upper
}
