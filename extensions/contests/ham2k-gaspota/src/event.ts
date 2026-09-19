// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Georgia State Parks on the Air — what the sponsor's rules state, as data.
// Section numbers are the "2026 GA-POTA Rules v.1.2 (4/20/2026)"
// (https://gaparks.org/wp-content/uploads/2026/04/2026-GA-POTA-Rules-v.1.2.pdf).

import parks from "./parks.json" with { type: "json" }

/// The ref type an operation stores. It is data in the operator's log, so it
/// never follows a rename of the package.
export const TYPE = 'gaspota'

/// What an operation logged under the combined State Parks extension carries:
/// `{type: 'stateparks', ref: 'GASP'}`. Those are not migrated — a log is not
/// an extension's to edit after the fact — so every read reaches back for one,
/// and the manifest, the setup control and the runtime each state the claim
/// (`ref:stateparks/gasp`, the app's docs/extensions/README.md).
export const LEGACY_TYPE = 'stateparks'
export const LEGACY_KEY = 'GASP'
export const LEGACY_CLAIM = `${LEGACY_TYPE}/${LEGACY_KEY.toLowerCase()}`

/// As the sponsor's rules title it. Not translated: it is a proper name.
export const NAME = 'Georgia State Parks on the Air'
export const URL = 'https://gaparks.org/'

/// §2: "1200 UTC, April 18, to 2359 UTC, April 19", 2026. The manifest's
/// `relevance.dates` has to move with these.
export const START_MILLIS = Date.UTC(2026, 3, 18, 12, 0)
export const END_MILLIS = Date.UTC(2026, 3, 19, 23, 59)

/// §4.1: "operations on the WARC bands (12, 17, 30 and 60m) are not permitted."
/// Nothing else is excluded.
export const EXCLUDED_BANDS = ['60m', '30m', '17m', '12m']

/// §6.1.1: "an additional 5 pts for each QSO with each distinct GA park" — which
/// every example and the sponsor's score sheet apply once per distinct park
/// ("Contact Points: B + (5*C)"), however many QSOs it took.
export const POINTS_PER_DISTINCT_PARK = 5

/// §6.2.3, the hunters' "Two-Day Bonus: Hunt Georgia Parks on both UTC days for
/// a 100 point bonus."
export const TWO_DAY_BONUS = 100

/// "One of the 52 listed parks" (§6.1.1), as POTA references.
export const PARKS: ReadonlySet<string> = new Set(parks)

/// The mode a contact is counted under. §4.4: "Each mode (FT8, FT4, RTTY, etc.)
/// counts as a separate contact" — modes, not the PHONE/CW/DATA families the
/// other contests fold them into. The sidebands are one mode. Every mode is
/// worth the same point: §6.1.2.1's 40 SSB and 10 CW are 50.
export function slotMode(mode: string): string {
  const upper = mode.toUpperCase()
  return upper === 'USB' || upper === 'LSB' ? 'SSB' : upper
}
