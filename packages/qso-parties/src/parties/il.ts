// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/il.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./il.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "il-qso-party",
  name: "Illinois QSO Party",
  short: "ILQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "il" }],
  state: "IL",
  cabrilloName: "IL-QSO-PARTY",
  url: "https://w9awe.org/ilqp/",
  status: "Date confirmed for 2026, rules and bonus stations not verified",
  lastUpdated: "2026-09-17 12:00Z",
  periods: [
    // 2026-10-18 17:00Z — 2026-10-19 01:00Z
    { startMillis: 1792342800000, endMillis: 1792371600000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  dxEntityMultiplierMax: 5,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  bonusStations: { W9AWE: 100, W9OAB: 100 },
  entryClasses: {
    operator: ["MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER"],
  },
  counties,
}
