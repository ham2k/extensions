// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/vt.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./vt.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "vermont-qso-party",
  name: "Vermont QSO Party",
  short: "VTQP",
  state: "VT",
  cabrilloName: "VT-QSO-PARTY",
  url: "https://www.ranv.org/vtqso.html",
  status: "Revised for 2026",
  lastUpdated: "2026-01-20 15:00Z",
  periods: [
    // 2026-2-7 00:00Z — 2026-2-8 23:59Z
    { startMillis: 1770422400000, endMillis: 1770595140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  multsPerBand: true,
  pointsByMode: { PHONE: 1, CW: 3, DATA: 2 },
  powerMultipliers: { QRP: 2, LOW: 1.5, HIGH: 1 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
  },
  counties,
}
