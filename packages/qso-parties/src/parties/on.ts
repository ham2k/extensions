// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/on.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./on.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "on-qso-party",
  name: "Ontario QSO Party",
  short: "ONQP",
  state: "ON",
  cabrilloName: "ON-QSO-PARTY",
  url: "https://www.va3cco.com/oqp/index.htm",
  status: "Updated for 2026, but not yet verified. Bonus points for rovers not implemented yet.",
  lastUpdated: "2026-03-18 12:00Z",
  periods: [
    // 2026-4-18 18:00Z — 2026-4-19 03:00Z
    { startMillis: 1776535200000, endMillis: 1776567600000 },
    // 2026-4-19 12:00Z — 2026-4-19 20:00Z
    { startMillis: 1776600000000, endMillis: 1776628800000 },
  ],
  entity: "VE",
  countyLine: true,
  dxEntityIsMultiplier: true,
  multsPerBand: true,
  pointsByMode: { PHONE: 2, CW: 2 },
  bonusStations: { VA3CCO: 8, VE3CCO: 8, VE3ODX: 8, VA3RAC: 8, VE3RHQ: 8 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE", "MULTI-TWO", "MULTI-UNLIMITED"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", LOW: "150W", HIGH: ">150W" },
    station: ["FIXED", "MOBILE", "ROVER"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
