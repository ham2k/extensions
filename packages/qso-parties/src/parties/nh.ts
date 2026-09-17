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
  status: "Verified for 2026 against w1wqm.org",
  lastUpdated: "2026-09-16 12:00Z",
  periods: [
    // 2026-9-19 16:00Z — 2026-9-20 04:00Z
    { startMillis: 1789833600000, endMillis: 1789876800000 },
    // 2026-9-20 12:00Z — 2026-9-20 22:00Z
    { startMillis: 1789905600000, endMillis: 1789941600000 },
  ],
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  outOfStateMultsPerBand: true,
  dxEntityMultiplierMax: 10,
  pointsByMode: { PHONE: 1, CW: 2 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE"],
  },
  counties,
}
