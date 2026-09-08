// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/va.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./va.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "virginia-qso-party",
  name: "Virginia QSO Party",
  short: "VAQP",
  state: "VA",
  cabrilloName: "VA-QSO-PARTY",
  url: "https://www.qsl.net/sterling/VA_QSO_Party/2026_VQP/2026_VQP_Main.html",
  status: "Updated for 2026, but not verified!",
  lastUpdated: "2026-02-28 12:00Z",
  periods: [
    // 2026-3-21 14:00Z — 2026-3-22 03:59Z
    { startMillis: 1774101600000, endMillis: 1774151940000 },
    // 2026-3-22 12:00Z — 2026-3-22 23:59Z
    { startMillis: 1774180800000, endMillis: 1774223940000 },
  ],
  selfCountsForCounty: true,
  dxEntityIsMultiplier: true,
  bonus: {
    perActivatedCounty: 100,
    perActivatedCountyRoverOnly: true,
  },
  // `_ROVER_` names no super-mode, so nothing prices a contact with
  // it; carried because the sponsor publishes it.
  pointsByMode: { PHONE: 1, CW: 2, DATA: 2, _ROVER_: 5 },
  bonusStations: {
    K4L: 50,
    K4O: 50,
    K4V: 50,
    K4E: 50,
    K4R: 50,
    K4S: 50,
    AJ4LN: 50,
    KK4AIA: 50,
    KM4SK: 50,
    NQ4K: 50,
    W4KSN: 50,
    W8ANT: 50,
  },
  exchange: { number: true },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "ROVER", "EXPEDITION"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
}
