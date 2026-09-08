// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The mode a contact is priced and multiplied by.
//
// Spelled out here rather than imported from `@ham2k/lib-operation-data`: that
// library is one of the host's, provided to the SDK as a peer, and this package
// is consumed as source by extensions that bundle it. The three super-modes and
// the phone list below are that library's own — `superModeForMode` there folds
// every submode into its ADIF parent first and then asks the same two
// questions, so the answers agree for every mode a QSO party is run on.

/// Every mode that counts as PHONE, including the digital-voice submodes an
/// ADIF import may carry.
const PHONE_MODES = new Set([
  'SSB', 'USB', 'LSB', 'FM', 'AM',
  'DIGITALVOICE', 'C4FM', 'DMR', 'DSTAR', 'FREEDV', 'M17',
])

/// `CW`, `PHONE` or `DATA` — the vocabulary a party's `pointsByMode` table is
/// keyed by. Anything that is neither CW nor phone is data, which is what makes
/// an unlisted digital mode price as the sponsor's digital rate.
export function superModeForMode(mode: string): string {
  const upper = mode.trim().toUpperCase()
  if (upper === 'CW') return 'CW'
  return PHONE_MODES.has(upper) ? 'PHONE' : 'DATA'
}
