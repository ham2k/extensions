// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/7qp.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./7qp.counties.json" with { type: "json" }
import otherCounties from "./7qp.other-counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "7th-call-area-qso-party",
  name: "7th Call Area QSO Party",
  short: "7QP",
  // Every county here names its own state, in its abbreviation or in the table
  // below, so nothing reads this fallback. The party's own code stands in it:
  // a lead state for a party spanning several would be an invention.
  state: "7QP",
  cabrilloName: "7QP",
  url: "http://7qp.org/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-30 12:00z",
  periods: [
    // 2026-5-2 13:00Z — 2026-5-3 06:59Z
    { startMillis: 1777726800000, endMillis: 1777791540000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxIsMultiplier: true,
  dxEntityIsMultiplier: true,
  dxEntityMultiplierMax: 10,
  pointsByMode: { PHONE: 2, CW: 3, DATA: 4 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
  otherCounties,
}
