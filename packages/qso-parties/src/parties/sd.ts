// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/sd.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./sd.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "sdqsop",
  name: "South Dakota QSO Party",
  short: "SDQP",
  state: "SD",
  cabrilloName: "SDQSOP",
  status: "Updated for 2025, but not verified",
  periods: [
    // 2026-10-10 18:00Z — 2026-10-11 18:00Z
    { startMillis: 1791655200000, endMillis: 1791741600000 },
  ],
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "PORTABLE", "ROVER"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
