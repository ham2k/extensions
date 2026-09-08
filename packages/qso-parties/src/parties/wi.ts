// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/wi.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./wi.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "wisconsin-qso-party",
  name: "Wisconsin QSO Party",
  short: "WIQP",
  state: "WI",
  cabrilloName: "WIQP",
  url: "https://www.warac.org/wqp/wqp.htm",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-02-28 12:00Z",
  periods: [
    // 2026-3-15 18:00Z — 2026-3-16 00:59Z
    { startMillis: 1773597600000, endMillis: 1773622740000 },
  ],
  dcCountsAsMaryland: true,
  dxLocationIsPrefix: true,
  bonusPerBandMode: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  bonusStations: { W9FK: 100 },
  powerMultipliers: { QRP: 2, LOW: 1.5, HIGH: 1 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE"],
    overlay: ["ROOKIE"],
  },
  counties,
}
