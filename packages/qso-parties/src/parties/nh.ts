// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nh.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nh.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "nh-qso-party",
  name: "New Hampshire QSO Party",
  short: "NHQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "nh" }],
  state: "NH",
  cabrilloName: "NH-QSO-PARTY",
  url: "https://w1wqm.org/nh-qso-party/",
  status: "Verified for 2025; DX entity multipliers corrected against the sponsor’s rules (2026-09)",
  lastUpdated: "2025-09-04 12:00Z",
  periods: [
    // 2026-9-19 16:00Z — 2026-9-20 04:00Z
    { startMillis: 1789833600000, endMillis: 1789876800000 },
  ],
  dcCountsAsMaryland: true,
  dxIsMultiplier: true,
  dxEntityIsMultiplier: true,
  outOfStateMultsPerBand: true,
  dxEntityMultiplierMax: 10,
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
  },
  counties,
}
