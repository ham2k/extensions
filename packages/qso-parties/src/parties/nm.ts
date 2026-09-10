// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nm.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nm.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "nm-qso-party",
  name: "New Mexico QSO Party",
  short: "NMQP",
  state: "NM",
  cabrilloName: "NM-QSO-PARTY",
  url: "https://www.newmexicoqsoparty.org",
  status: "Updated for 2026, but not yet verified. Power multiplier and mobile bonus not implemented",
  lastUpdated: "2026-03-22 22:00Z",
  periods: [
    // 2026-4-11 14:00Z — 2026-4-12 01:59Z
    { startMillis: 1775916000000, endMillis: 1775959140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE"],
  },
  counties,
}
