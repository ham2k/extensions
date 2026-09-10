// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ny.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ny.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "ny-qso-party",
  name: "New York QSO Party",
  short: "NYQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "ny" }],
  state: "NY",
  cabrilloName: "NY-QSO-PARTY",
  url: "https://nyqp.org/",
  status: "Updated for 2025, but not verified",
  lastUpdated: "2025-02-20 00:00Z",
  periods: [
    // 2026-10-17 14:00Z — 2026-10-18 01:59Z
    { startMillis: 1792245600000, endMillis: 1792288740000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  stateCountsForInState: true,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 3 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "SCHOOL"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
    overlay: ["ROOKIE", "YOUTH", "YL"],
  },
  counties,
}
