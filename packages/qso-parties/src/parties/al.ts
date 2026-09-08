// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/al.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./al.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "alabama-qso-party",
  name: "Alabama QSO Party",
  short: "ALQP",
  state: "AL",
  cabrilloName: "AL-QSO-PARTY",
  url: "https://alabamacontestgroup.org/aqp/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00z",
  periods: [
    // 2026-7-25 15:00Z — 2026-7-26 03:00Z
    { startMillis: 1784991600000, endMillis: 1785034800000 },
  ],
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  selfCountsForCounty: true,
  pointsByMode: { PHONE: 2, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
