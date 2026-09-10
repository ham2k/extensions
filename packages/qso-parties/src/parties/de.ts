// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/de.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./de.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "de-qso-party",
  name: "Delaware QSO Party",
  short: "DEQP",
  state: "DE",
  cabrilloName: "DE-QSO-PARTY",
  url: "https://www.fsarc.org/qsoparty/qsohome.htm",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00Z",
  periods: [
    // 2026-5-2 17:00Z — 2026-5-3 23:59Z
    { startMillis: 1777741200000, endMillis: 1777852740000 },
  ],
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  dataAndCWCountAsSameMode: true,
  countiesAreMultipliersInParty: false,
  pointsByMode: { PHONE: 1, CW: 2 },
  powerMultipliers: { QRP: 3, LOW: 2, HIGH: 1 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
  },
  counties,
}
