// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/mi.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./mi.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "mi-qso-party",
  name: "Michigan QSO Party",
  short: "MIQP",
  state: "MI",
  cabrilloName: "MI-QSO-PARTY",
  url: "https://miqp.org/",
  status: "Updated for 2026, but not yet verified.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-18 16:00Z — 2026-4-19 03:59Z
    { startMillis: 1776528000000, endMillis: 1776571140000 },
  ],
  countyLine: true,
  selfCountsForCounty: true,
  dxIsMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", LOW: "100W", HIGH: ">100W" },
    station: ["FIXED", "MOBILE", "ROVER", "EOC"],
  },
  counties,
}
