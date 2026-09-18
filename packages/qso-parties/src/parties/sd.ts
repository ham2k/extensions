// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy assumes `SD-QSO-PARTY` as the
// Cabrillo name because the sponsor names none; the Cabrillo registry at
// contestcalendar.com lists `SDQSOP`, which is also this party's ref type.
// Never take polo's file back over this one: it would rename the contest every
// submitted log declares, and the extension's own identity with it.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/sd.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./sd.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "sdqsop",
  name: "South Dakota QSO Party",
  short: "SDQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "sd" }],
  state: "SD",
  cabrilloName: "SDQSOP",
  url: "https://pdarc.org/sd-qso-party",
  status: "Verified for 2026 against pdarc.org/sd-qso-party",
  lastUpdated: "2026-09-17 12:00Z",
  periods: [
    // 2026-10-10 18:00Z — 2026-10-11 18:00Z
    { startMillis: 1791655200000, endMillis: 1791741600000 },
  ],
  countyLine: true,
  dcCountsAsMaryland: true,
  dxEntityIsMultiplier: true,
  bonusPostMultiplier: true,
  pointsByMode: { PHONE: 1, CW: 2 },
  bonusStations: { W0OJY: 100 },
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "PORTABLE", "ROVER"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
