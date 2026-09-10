// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/mn.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./mn.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "mn-qso-party",
  name: "Minnesota QSO Party",
  short: "MNQP",
  state: "MN",
  cabrilloName: "MN-QSO-PARTY",
  url: "https://www.w0aa.org/mn-qso-party/",
  status: "Revised for 2026",
  lastUpdated: "2026-01-20 15:00Z",
  periods: [
    // 2026-2-7 14:00Z — 2026-2-7 23:59Z
    { startMillis: 1770472800000, endMillis: 1770508740000 },
  ],
  dxIsMultiplier: true,
  pointsByMode: { PHONE: 2, CW: 2, DATA: 2 },
  exchange: { name: true },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: "1500 watts" },
    station: ["FIXED", "MOBILE", "ROVER"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
