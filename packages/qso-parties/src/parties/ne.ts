// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ne.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ne.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "ne-qso-party",
  name: "Nebraska QSO Party",
  short: "NEQP",
  // No `legacyRefs`: `ne` is a prefix of New England's `neqp` — see
  // scripts/convert-parties.mjs.
  state: "NE",
  cabrilloName: "NE-QSO-PARTY",
  url: "https://nebraskaqsoparty.com/",
  status: "Updated for 2026, but not yet verified.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-25 14:00Z — 2026-4-27 01:59Z
    { startMillis: 1777125600000, endMillis: 1777255140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxLocationIsPrefix: true,
  // `SAT` names no super-mode, so nothing prices a contact with
  // it; carried because the sponsor publishes it.
  pointsByMode: { PHONE: 2, CW: 3, SAT: 4, DATA: 1 },
  bonusStations: { KA0BOJ: 100, K0SMM: 50, K0RPT: 50, K0NEB: 50, NF0N: 50, N0FER: 50, KE0XQ: 50 },
  powerMultipliers: { QRP: 5, LOW: 2, HIGH: 1 },
  entryClasses: {
    operator: ["MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
    mode: ["DIGITAL"],
  },
  counties,
}
