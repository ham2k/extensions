// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/tx.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./tx.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "texas-qso-party",
  name: "Texas QSO Party",
  short: "TXQP",
  state: "TX",
  cabrilloName: "TXQP",
  status: "Pending",
  periods: [
    // 2026-9-19 14:00Z — 2026-9-20 02:00Z
    { startMillis: 1789826400000, endMillis: 1789869600000 },
    // 2026-9-20 14:00Z — 2026-9-20 20:00Z
    { startMillis: 1789912800000, endMillis: 1789934400000 },
  ],
  entryClasses: {
    operator: ["SINGLE-OP", "MULTI-ONE"],
    power: ["QRP", "LOW", "HIGH"],
    powerLimits: { QRP: "5 watts CW/digital, 10 watts phone", LOW: "150 watts", HIGH: ">150 watts" },
    station: ["FIXED", "MOBILE"],
    mode: ["CW", "PHONE", "MIXED"],
  },
  counties,
}
