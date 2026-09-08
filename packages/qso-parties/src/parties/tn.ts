// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/tn.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./tn.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "tennessee-qso-party",
  name: "Tennessee QSO Party",
  short: "TNQP",
  state: "TN",
  cabrilloName: "TN-QSO-PARTY",
  url: "https://tnqp.org/rules/",
  status: "Updated for 2026, but rules based on 2025",
  lastUpdated: "2026-04-21 12:00z",
  periods: [
    // 2026-9-6 17:00Z — 2026-9-7 02:59Z
    { startMillis: 1788714000000, endMillis: 1788749940000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  selfMobileCountsForCounty: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  multsPerBand: true,
  bonusPostMultiplier: true,
  bonus: {
    perActivatedCounty: 500,
    perActivatedCountyMinimumCount: 10,
    perActivatedCountyRoverOnly: true,
  },
  pointsByMode: { PHONE: 3, CW: 3, DATA: 3 },
  bonusStations: { K4TCG: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "ROVER"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
}
