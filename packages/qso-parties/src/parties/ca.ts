// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ca.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ca.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "california-qso-party",
  name: "California QSO Party",
  short: "CQP",
  state: "CA",
  cabrilloName: "CA-QSO-PARTY",
  url: "https://www.cqp.org/",
  status: "Updated for 2025, but not verified",
  lastUpdated: "2025-09-08 12:00Z",
  periods: [
    // 2026-10-3 16:00Z — 2026-10-4 21:59Z
    { startMillis: 1791043200000, endMillis: 1791151140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  pointsByMode: { PHONE: 2, CW: 3 },
  exchange: { number: true },
  entryClasses: {
    operator: ["SINGLE-OP", "SINGLE-OP-ASSISTED", "MULTI-ONE", "MULTI-TWO", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION", "COUNTY-LINE"],
    overlay: ["YOUTH", "YL", "NEW-CONTESTER"],
  },
  counties,
}
