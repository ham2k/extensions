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
  refType: "neqp",
  name: "New England QSO Party",
  short: "NEQP",
  // Several states, no one of them this party's own. Every county below names
  // its state, in its abbreviation or in the table, and `states` is the list
  // each of those has to fall in — a check on the county data, and nothing a
  // score reads.
  states: ["CT", "MA", "ME", "NH", "RI", "VT"],
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
