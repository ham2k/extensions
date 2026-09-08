// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nd.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nd.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "north-dakota-qso-party",
  name: "North Dakota QSO Party",
  short: "NDQP",
  state: "ND",
  cabrilloName: "ND-QSO-PARTY",
  url: "https://ndarrlsection.com",
  status: "Updated for 2026, but not yet verified.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-11 18:00Z — 2026-4-12 17:59Z
    { startMillis: 1775930400000, endMillis: 1776016740000 },
  ],
  dxLocationIsPrefix: true,
  pointsByMode: { PHONE: 1, CW: 1, DATA: 1 },
  entryClasses: {
    station: ["FIXED", "MOBILE", "PORTABLE"],
  },
  counties,
}
