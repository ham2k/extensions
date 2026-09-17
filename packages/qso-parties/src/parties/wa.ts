// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/wa.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./wa.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "wa-salmon-run",
  name: "Washington Salmon Run",
  short: "WAQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "wa" }],
  state: "WA",
  cabrilloName: "WA-SALMON-RUN",
  url: "https://salmonrun.wwdxc.org/",
  status: "Verified for 2026 against salmonrun.wwdxc.org",
  lastUpdated: "2026-09-16 12:00Z",
  periods: [
    // 2026-9-19 16:00Z — 2026-9-20 06:59Z
    { startMillis: 1789833600000, endMillis: 1789887540000 },
    // 2026-9-20 16:00Z — 2026-9-20 23:59Z
    { startMillis: 1789920000000, endMillis: 1789948740000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  dxLocationIsPrefix: true,
  bonusPerMode: true,
  bonusPostMultiplier: true,
  dxEntityMultiplierMax: 10,
  pointsByMode: { PHONE: 2, CW: 3 },
  bonusStations: { W7DX: 500 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-TWO", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "100 watts", HIGH: ">100 watts" },
    station: ["FIXED", "MOBILE", "EXPEDITION", "CLUB"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
