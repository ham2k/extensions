// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ky.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ky.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "kyqp",
  name: "Kentucky QSO Party",
  short: "KYQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "ky" }],
  state: "KY",
  cabrilloName: "KYQP",
  url: "https://kyqsoparty.org/rules/",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00Z",
  periods: [
    // 2026-6-6 13:00Z — 2026-6-7 00:59Z
    { startMillis: 1780750800000, endMillis: 1780793940000 },
  ],
  countyLine: true,
  stateCountsForInState: true,
  bonusPerBandMode: true,
  bonusPostMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2 },
  bonusStations: { K4KCG: 100 },
  powerMultipliers: { QRP: 3, LOW: 2, HIGH: 1 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
