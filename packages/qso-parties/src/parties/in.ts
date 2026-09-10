// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/in.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./in.counties.json" with { type: "json" }
import otherCounties from "./in.other-counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "in-qso-party",
  name: "Indiana QSO Party",
  short: "INQP",
  state: "IN",
  cabrilloName: "IN-QSO-PARTY",
  url: "http://www.hdxcc.org/inqp/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-30 12:00Z",
  periods: [
    // 2026-5-2 15:00Z — 2026-5-3 02:59Z
    { startMillis: 1777734000000, endMillis: 1777777140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  multsPerMode: true,
  pointsByMode: { PHONE: 2, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER", "COUNTY-LINE"],
  },
  counties,
  otherCounties,
}
