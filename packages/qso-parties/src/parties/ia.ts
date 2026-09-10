// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ia.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ia.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "iaqp",
  name: "Iowa QSO Party",
  short: "IAQP",
  state: "IA",
  cabrilloName: "IAQP",
  url: "http://www.w0yl.com/IAQP",
  status: "Updated for 2025, but not verified",
  lastUpdated: "2025-02-20 00:00Z",
  periods: [
    // 2026-9-19 14:00Z — 2026-9-20 01:59Z
    { startMillis: 1789826400000, endMillis: 1789869540000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "5-150 Watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
  },
  counties,
}
