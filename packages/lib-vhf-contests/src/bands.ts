// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The per-band distance multiplier the IARU R1 VHF+ family scores with, which
// RSGB's events use unchanged.

/// All 1 except the millimeter bands, matching app-polo's table — R1 doesn't
/// scale the microwave bands as steeply as ARRL's family does. `5m`, `33cm`
/// and `3cm` are absent from app-polo's own table (`distance *
/// BAND_MULTIPLIERS[band]` is `NaN` there for those bands) even though
/// `lib-operation-data`'s VHF_BANDS/UHF_BANDS/SHF_BANDS — spread into
/// `ALL_BANDS` and `R1-VHF-UHF-OCTOBER`'s band list in r1-vhf-tests'
/// events.ts — include them; here at 1, consistent with every other
/// non-millimeter band.
export const BAND_MULTIPLIERS: Record<string, number> = {
  '6m': 1, '5m': 1, '4m': 1, '2m': 1, '1.25m': 1, '70cm': 1, '33cm': 1,
  '23cm': 1, '13cm': 1, '9cm': 1, '6cm': 1, '3cm': 1, '1.25cm': 1,
  '6mm': 2, '4mm': 3, '2.5mm': 4, '2mm': 8, '1mm': 10, submm: 10,
}
