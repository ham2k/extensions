// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/acqp.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./acqp.counties.json" with { type: "json" }
import countyStates from "./acqp.county-states.json" with { type: "json" }

/// A county's own state, for a party spanning several: its codes carry no
/// state prefix for the ordinary rule to read.
const COUNTY_STATES: Record<string, string> = countyStates

export const PARTY: QsoPartyParams = {
  refType: "ac-qso-party",
  name: "Atlantic Canada QSO Party",
  short: "ACQP",
  // Several states, no one of them this party's own. Every county below names
  // its state, in its abbreviation or in the table, and `states` is the list
  // each of those has to fall in — a check on the county data, and nothing a
  // score reads.
  states: ["NB", "NL", "NS", "PE"],
  cabrilloName: "AC-QSO-PARTY",
  url: "https://www.acqp.ca/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00Z",
  periods: [
    // 2026-6-7 14:00Z — 2026-6-8 01:59Z
    { startMillis: 1780840800000, endMillis: 1780883940000 },
  ],
  entity: "VE",
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  multsPerBand: true,
  countiesAreMultipliersInParty: false,
  pointsByMode: { PHONE: 1, CW: 1 },
  bonusStations: { VE1RAC: 5, VE9RAC: 5, VY2RAC: 5, VO1RAC: 5 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", LOW: "100W", HIGH: ">100W" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
  },
  counties,
  stateOfCounty: (county) => COUNTY_STATES[county.toUpperCase()],
}
