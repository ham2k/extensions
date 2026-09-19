// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Texas State Parks On The Air — what the sponsor's rules state, as data.
// Section numbers are the sponsor's "[Official] TSPOTA_Rules", the document
// embedded at https://www.tspota.org/rules, as it stood for the 2026 event.

import parks from "./parks.json" with { type: "json" }

/// The ref type an operation stores. It is data in the operator's log, so it
/// never follows a rename of the package.
export const TYPE = 'txspota'

/// What an operation logged under the combined State Parks extension carries:
/// `{type: 'stateparks', ref: 'TXSP'}`. Those are not migrated — a log is not
/// an extension's to edit after the fact — so every read reaches back for one,
/// and the manifest, the setup control and the runtime each state the claim
/// (`ref:stateparks/txsp`, the app's docs/extensions/README.md).
export const LEGACY_TYPE = 'stateparks'
export const LEGACY_KEY = 'TXSP'
export const LEGACY_CLAIM = `${LEGACY_TYPE}/${LEGACY_KEY.toLowerCase()}`

/// As the sponsor's rules title it. Not translated: it is a proper name.
export const NAME = 'Texas State Parks On The Air'
export const URL = 'https://www.tspota.org/'

/// §2: "Friday, April 17 @ 7:00 PM CDT (Saturday 00:00 UTC) through Sunday,
/// April 19, 6:59 PM CDT (23:59 UTC)", 2026. The manifest's `relevance.dates`
/// has to move with these.
export const START_MILLIS = Date.UTC(2026, 3, 18, 0, 0)
export const END_MILLIS = Date.UTC(2026, 3, 19, 23, 59)

/// §4.3: "all Amateur bands … except on 60 meters, 30 meters, 17 meters and 12
/// meters."
export const EXCLUDED_BANDS = ['60m', '30m', '17m', '12m']

/// A park is "activated" (§6.3.3, §6.4.2) at POTA's own threshold: the rules
/// give none of their own, and §9.1 says "All standard POTA rules apply".
export const QSOS_TO_ACTIVATE = 10

/// §6.4.1: "Five (5) additional points for working the host club station,
/// K5LRK, once per contest."
export const HOST_STATION = 'K5LRK'
export const HOST_STATION_BONUS = 5

/// §6.4.2: "Fifty (50) additional points for Activators who activate more than
/// three (3) parks".
export const MANY_PARKS_OVER = 3
export const MANY_PARKS_BONUS = 50

/// §6.4.3: "Fifty (50) additional points to the final score for working and
/// logging the same Activator call in three (3) different parks".
///
/// Awarded ONCE, however many calls qualify: the rule does not say it repeats,
/// and an undercount is the safer error in a score the sponsor's own uploader
/// recomputes.
export const ROVER_PARKS = 3
export const ROVER_BONUS = 50

/// A power class: the value stored on our ref, the sponsor's ceiling for it, and
/// what it adds to the multiplier SUM.
///
/// A summand despite the "3X" the rules print beside it — §6.5.1: "Total score =
/// total QSO points X (power multiplier + Texas State Parks worked multiplier +
/// Texas State Parks activated multiplier) + bonus points". So QRP's 3 adds
/// three multipliers; it does not treble the score.
export interface PowerClass { value: string; watts: string; adds: number }

/// §6.3.4. The values are the ones the combined extension stored as `ourPower`,
/// so an operation set up there keeps its class. The watts are not translated:
/// an operator checking which class they are in wants the rule book's figure.
export const POWER_CLASSES: PowerClass[] = [
  { value: 'QRP', watts: '≤5W CW/digital, ≤10W SSB', adds: 3 },
  { value: 'LP', watts: '≤150W', adds: 2 },
  { value: 'HP', watts: '>150W', adds: 1 },
]

/// The park directory on tspota.org, as POTA references.
export const PARKS: ReadonlySet<string> = new Set(parks)

/// §6.2: "Each non-duplicate phone or digital contact … is worth one point";
/// "Each non-duplicate CW contact … is worth two points."
export function pointsForMode(mode: string): number {
  return mode === 'CW' ? 2 : 1
}

/// The mode a contact is counted under. §4.2: "Each mode (FT8, FT4, RTTY, etc.)
/// counts as a separate contact" — modes, not the PHONE/CW/DATA families the
/// other contests fold them into. The sidebands are one mode.
export function slotMode(mode: string): string {
  const upper = mode.toUpperCase()
  return upper === 'USB' || upper === 'LSB' ? 'SSB' : upper
}
