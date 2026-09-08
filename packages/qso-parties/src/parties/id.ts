// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/id.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./id.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "idaho-qso-party",
  name: "Idaho QSO Party",
  short: "IDQP",
  state: "ID",
  cabrilloName: "ID-QSO-PARTY",
  url: "https://idahoqsoparty.org/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-02-28 12:00Z",
  periods: [
    // 2026-3-14 16:00Z — 2026-3-15 03:59Z
    { startMillis: 1773504000000, endMillis: 1773547140000 },
    // 2026-3-15 14:00Z — 2026-3-16 01:59Z
    { startMillis: 1773583200000, endMillis: 1773626340000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  multsPerMode: true,
  removeCountySuffixes: true,
  bonusStationInStateMult: 0,
  bonus: {
    bonusStationSweep: 100,
  },
  // `_QRP_` names no super-mode, so nothing prices a contact with
  // it; carried because the sponsor publishes it.
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2, _QRP_: 5 },
  bonusStations: { K7S: 100, K7P: 100, K7U: 100, K7D: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "ROVER"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
}
