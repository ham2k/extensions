// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/neqp.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./neqp.counties.json" with { type: "json" }
import otherCounties from "./neqp.other-counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "new-england-qso-party",
  name: "New England QSO Party",
  short: "NEQP",
  // Every county here names its own state, in its abbreviation or in the table
  // below, so nothing reads this fallback. The party's own code stands in it:
  // a lead state for a party spanning several would be an invention.
  state: "NEQP",
  cabrilloName: "NEQP",
  url: "https://www.neqp.org/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-30 12:00Z",
  periods: [
    // 2026-5-2 20:00Z — 2026-5-3 04:59Z
    { startMillis: 1777752000000, endMillis: 1777784340000 },
    // 2026-5-3 13:00Z — 2026-5-3 23:59Z
    { startMillis: 1777813200000, endMillis: 1777852740000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  dataAndCWCountAsSameMode: true,
  countiesAreMultipliersInParty: false,
  pointsByMode: { PHONE: 1, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE"],
  },
  counties,
  otherCounties,
}
