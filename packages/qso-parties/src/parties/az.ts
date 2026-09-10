// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/az.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./az.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "az-qso-party",
  name: "Arizona QSO Party",
  short: "AZQP",
  state: "AZ",
  cabrilloName: "AZ-QSO-PARTY",
  url: "https://www.azqp.org/",
  status: "Added from the sponsor’s rules (2026); scoring not yet verified against a submitted log",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-10-10 15:00Z — 2026-10-11 05:00Z
    { startMillis: 1791644400000, endMillis: 1791694800000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  multsPerMode: true,
  outOfStateMultsPerBand: true,
  countiesAreMultipliersInParty: false,
  pointsByMode: { PHONE: 1, CW: 2 },
  bonusStations: { K7A: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION", "COUNTY-LINE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
