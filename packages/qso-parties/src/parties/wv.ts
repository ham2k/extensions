// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/wv.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./wv.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "west-virginia-qso-party",
  name: "West Virginia QSO Party",
  short: "WVQP",
  state: "WV",
  cabrilloName: "WVQP",
  url: "https://www.qsl.net/wvqp/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00Z",
  periods: [
    // 2026-6-20 16:00Z — 2026-6-21 03:59Z
    { startMillis: 1781971200000, endMillis: 1782014340000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  bonusPerBandMode: true,
  bonusPostMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  bonusStations: { W8WVA: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts CW, 10 watts phone", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE"],
  },
  counties,
}
