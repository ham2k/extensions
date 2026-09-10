// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy ends on 2025-2-29, a date
// that year does not have, which a date parser rolls forward into a period
// the sponsor never published. These dates were re-read from the sponsor's
// own rules in September 2026. Never take polo's file back over this one.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/sc.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./sc.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "sc-qso-party",
  name: "South Carolina QSO Party",
  short: "SCQP",
  state: "SC",
  cabrilloName: "SC-QSO-PARTY",
  url: "https://scqso.com/",
  status: "Dates verified for 2026 against the sponsor’s rules",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-2-28 15:00Z — 2026-3-1 01:59Z
    { startMillis: 1772290800000, endMillis: 1772330340000 },
  ],
  countyLine: true,
  stateCountsForInState: true,
  multsPerBandMode: true,
  bonusPerBandMode: true,
  inStateToOutOfStatePointsDouble: true,
  pointsByMode: { PHONE: 2, CW: 2, DATA: 2 },
  bonusStations: { W4CAE: 350, WW4SF: 250, K4YTZ: 250 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", LOW: "100W", HIGH: ">100W" },
    station: ["FIXED", "MOBILE", "EXPEDITION"],
    mode: ["CW", "PHONE", "DIGITAL", "MIXED"],
  },
  counties,
}
