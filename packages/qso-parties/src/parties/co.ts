// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/co.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./co.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "colorado-qso-party",
  name: "Colorado QSO Party",
  short: "COQP",
  state: "CO",
  cabrilloName: "COQP",
  url: "https://coloradoqsoparty.org/",
  status: "Updated for 2026. Mixed mode scoring will not be accurate.",
  lastUpdated: "2026-08-07 12:00Z",
  periods: [
    // 2026-9-12 14:00Z — 2026-9-13 03:59Z
    { startMillis: 1789221600000, endMillis: 1789271940000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxIsMultiplier: true,
  multsPerMode: true,
  bonusPostMultiplier: true,
  bonus: {
    perActivatedCounty: 500,
    perActivatedCountyMinimumCount: 15,
    perActivatedCountyRoverOnly: true,
  },
  pointsByMode: { PHONE: 2, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
