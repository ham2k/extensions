// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ga.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ga.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "georgia-qso-party",
  name: "Georgia QSO Party",
  short: "GAQP",
  state: "GA",
  cabrilloName: "GA-QSO-PARTY",
  url: "https://www.gaqsoparty.com/",
  status: "Updated for 2026, but not yet verified.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-11 18:00Z — 2026-4-12 03:59Z
    { startMillis: 1775930400000, endMillis: 1775966340000 },
    // 2026-4-12 14:00Z — 2026-4-12 23:59Z
    { startMillis: 1776002400000, endMillis: 1776038340000 },
  ],
  countyLine: true,
  stateCountsForInState: true,
  selfCountsForCounty: true,
  multsPerMode: true,
  pointsByMode: { PHONE: 1, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-TWO"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W/10W", LOW: "150W", HIGH: ">150W" },
    station: ["FIXED", "PORTABLE", "ROVER"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
