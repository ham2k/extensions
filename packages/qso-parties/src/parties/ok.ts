// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ok.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ok.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "oklahoma-qso-party",
  name: "Oklahoma QSO Party",
  short: "OKQP",
  state: "OK",
  cabrilloName: "OK-QSO-PARTY",
  url: "http://k5cm.com/okqp.htm",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-02-28 12:00Z",
  periods: [
    // 2026-3-14 14:00Z — 2026-3-15 01:59Z
    { startMillis: 1773496800000, endMillis: 1773539940000 },
    // 2026-3-15 15:00Z — 2026-3-15 21:59Z
    { startMillis: 1773586800000, endMillis: 1773611940000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  pointsByMode: { PHONE: 2, CW: 3, DATA: 3 },
  entryClasses: {
    operator: ["SINGLE-OP", "SINGLE-OP-ASSISTED", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
