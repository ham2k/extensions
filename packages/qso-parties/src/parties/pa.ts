// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/pa.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./pa.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "pa-qso-party",
  name: "Pennsylvania QSO Party",
  short: "PAQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "pa" }],
  state: "PA",
  cabrilloName: "PA-QSO-PARTY",
  url: "https://paqso.org/index.html",
  status: "Verified for 2026 against paqso.org (rules rev 08/25/26)",
  lastUpdated: "2026-09-18 12:00Z",
  periods: [
    // 2026-10-10 16:00Z — 2026-10-11 04:00Z
    { startMillis: 1791648000000, endMillis: 1791691200000 },
    // 2026-10-11 13:00Z — 2026-10-11 22:00Z
    { startMillis: 1791723600000, endMillis: 1791756000000 },
  ],
  countyLine: true,
  sectionsForOutOfState: true,
  dxIsMultiplier: true,
  bonusPerBandMode: true,
  bonusPostMultiplier: true,
  bonus: {
    perActivatedCounty: 500,
    perActivatedCountyMinimumCount: 10,
    perActivatedCountyRoverOnly: true,
  },
  pointsByMode: { PHONE: 1, CW: 2 },
  bonusStations: { K3ZMC: 200 },
  powerMultipliers: { QRP: 2 },
  exchange: { number: true },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER", "COUNTY-LINE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
