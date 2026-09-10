// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/mo.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./mo.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "mo-qso-party",
  name: "Missouri QSO Party",
  short: "MOQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "mo" }],
  state: "MO",
  cabrilloName: "MO-QSO-PARTY",
  url: "https://w0ma.org/index.php/missouri-qso-party",
  status: "Updated for 2026, but not yet verified.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-11 14:00Z — 2026-4-12 03:59Z
    { startMillis: 1775916000000, endMillis: 1775966340000 },
    // 2026-4-12 14:00Z — 2026-4-12 19:59Z
    { startMillis: 1776002400000, endMillis: 1776023940000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxIsMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  bonusStations: { W0MA: 100, K0GQ: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION", "SCHOOL", "CLUB"],
    mode: ["CW", "PHONE", "MIXED"],
    overlay: ["ROOKIE"],
  },
  counties,
}
