// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/tx.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./tx.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "txqp",
  name: "Texas QSO Party",
  short: "TXQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "tx" }],
  state: "TX",
  cabrilloName: "TXQP",
  url: "https://www.txqp.net/",
  status: "Verified for 2026 against txqp.net",
  lastUpdated: "2026-09-16 12:00Z",
  periods: [
    // 2026-9-19 14:00Z — 2026-9-20 02:00Z
    { startMillis: 1789826400000, endMillis: 1789869600000 },
    // 2026-9-20 14:00Z — 2026-9-20 20:00Z
    { startMillis: 1789912800000, endMillis: 1789934400000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  bonusPostMultiplier: true,
  bonus: {
    perActivatedCounty: 1000,
    perActivatedCountyMinimumCount: 5,
    perActivatedCountyRoverOnly: true,
  },
  pointsByMode: { PHONE: 2, CW: 3, DATA: 3 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts CW/digital, 10 watts phone", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
