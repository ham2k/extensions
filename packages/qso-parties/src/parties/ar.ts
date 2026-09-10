// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ar.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ar.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "ar-qso-party",
  name: "Arkansas QSO Party",
  short: "ARQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "ar" }],
  state: "AR",
  cabrilloName: "AR-QSO-PARTY",
  url: "https://arkqp.com",
  status: "Updated for 2026, but not verified",
  lastUpdated: "2026-04-21 12:00z",
  periods: [
    // 2026-5-16 14:00Z — 2026-5-17 01:59Z
    { startMillis: 1778940000000, endMillis: 1778983140000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  selfCountsForCounty: true,
  dxIsMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 1, DATA: 1 },
  bonusStations: { WR5P: 200 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
}
