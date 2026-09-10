// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy carries a 2025 end year
// against a 2026 start; these dates were re-read from the sponsor's own
// rules in September 2026, which advertise 28 Feb 2027 next. Never take
// polo's file back over this one without re-reading the sponsor.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nc.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nc.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "nc-qso-party",
  name: "North Carolina QSO Party",
  short: "NCQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "nc" }],
  state: "NC",
  cabrilloName: "NC-QSO-PARTY",
  url: "https://ncqsoparty.org/",
  status: "Dates verified for 2026 against the sponsor’s rules; the sponsor advertises 28 Feb 2027 next",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-3-1 15:00Z — 2026-3-2 01:00Z
    { startMillis: 1772377200000, endMillis: 1772413200000 },
  ],
  countyLine: true,
  selfCountsForCounty: true,
  dxIsMultiplier: true,
  bonusPostMultiplier: true,
  bonus: {
    rareCountySweep: 500,
    rareCountySweepMinimumCount: 5,
  },
  pointsByMode: { PHONE: 2, CW: 3, DATA: 5 },
  rareCountyMultipliers: {
    CAB: 10,
    GRM: 10,
    VAN: 10,
    MAC: 10,
    DAV: 10,
    CUR: 10,
    PAM: 10,
    ALL: 10,
    PER: 10,
    CAS: 10,
  },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts CW or 10 watts phone", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE", "PORTABLE", "EXPEDITION"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
