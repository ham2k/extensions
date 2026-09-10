// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy still carries 2025 dates
// and no rules URL at all; both were re-read from the sponsor in September
// 2026. The scoring rules are still unverified — the dates are not. Never
// take polo's file back over this one without re-reading the sponsor.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nj.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nj.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "njqp",
  name: "New Jersey QSO Party",
  short: "NJQP",
  state: "NJ",
  cabrilloName: "NJQP",
  url: "https://sites.google.com/view/k2td-bcrc/nj-qp/rules",
  status: "Dates verified for 2026 against the sponsor’s rules; scoring rules not yet verified",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-9-12 14:00Z — 2026-9-13 02:00Z
    { startMillis: 1789221600000, endMillis: 1789264800000 },
  ],
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5W", HIGH: "150W or greater" },
    station: ["FIXED", "MOBILE", "PORTABLE", "ROVER"],
    overlay: ["ROOKIE"],
  },
  counties,
}
