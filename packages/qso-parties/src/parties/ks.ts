// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ks.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ks.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "ks-qso-party",
  name: "Kansas QSO Party",
  short: "KSQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "ks" }],
  state: "KS",
  cabrilloName: "KS-QSO-PARTY",
  url: "https://ksqsoparty.org/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00Z",
  periods: [
    // 2026-8-29 14:00Z — 2026-8-30 01:59Z
    { startMillis: 1788012000000, endMillis: 1788055140000 },
    // 2026-8-30 14:00Z — 2026-8-30 19:59Z
    { startMillis: 1788098400000, endMillis: 1788119940000 },
  ],
  countyLine: true,
  stateCountsForInState: true,
  dxIsMultiplier: true,
  bonusPostMultiplier: true,
  pointsByMode: { PHONE: 2, CW: 3, DATA: 3 },
  bonusStations: { KS0KS: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER", "EXPEDITION", "COUNTY-LINE", "CLUB"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
    overlay: ["YOUTH"],
  },
  counties,
}
