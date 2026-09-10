// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy still carries 2025 dates
// and the old `warsalmonrun.org`, which no longer resolves; the event's page
// is `salmonrun.wwdxc.org`. Both were re-read from the sponsor in September
// 2026. Never take polo's file back over this one without re-reading them.
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
  status: "Dates verified for 2026 against the sponsor’s rules",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-9-19 16:00Z — 2026-9-20 07:00Z
    { startMillis: 1789833600000, endMillis: 1789887600000 },
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
