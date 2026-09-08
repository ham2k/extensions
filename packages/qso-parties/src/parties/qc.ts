// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/qc.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./qc.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "quebec-qso-party",
  name: "Quebec QSO Party",
  short: "QCQP",
  state: "QC",
  cabrilloName: "QC-QSO-PARTY",
  url: "https://quebecqsoparty.org/",
  status: "Updated for 2026, but not yet verified. Mobile station bonuses not implemented yet.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-19 13:00Z — 2026-4-19 23:59Z
    { startMillis: 1776603600000, endMillis: 1776643140000 },
  ],
  entity: "VE",
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxIsMultiplier: true,
  multsPerBand: true,
  pointsByMode: { PHONE: 1, CW: 2 },
  bonusStations: { VE2CRO: 10 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", LOW: "100W", HIGH: ">100W" },
    station: ["FIXED", "MOBILE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
