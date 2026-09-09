// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Reading and guessing the grid half of the exchange, which every R1 and
// RSGB VHF+ event sends in the same shape.

import type { JSONValue } from "@ham2k/extension-sdk"

/// Every R1 VHF+ event sends a 6-character grid — unlike arrl-vhf-tests,
/// there is no 4-character shape here, so no per-event `gridChars`.
export const GRID_PATTERN = '^[A-R]{2}[0-9]{2}[A-X]{2}$'

export function trimmedGrid(grid: string | undefined | null): string {
  return (grid ?? '').trim().toUpperCase().substring(0, 6)
}

/// The grid to offer for the station being worked, from whatever the callsign
/// lookup or a prior QSO with this call resolved.
export function guessedGrid(their: Record<string, JSONValue> | undefined): string {
  const guess = (their?.guess as Record<string, JSONValue>) ?? {}
  const raw = (their?.grid as string | undefined) ?? (guess.grid as string | undefined)
  return trimmedGrid(raw)
}
