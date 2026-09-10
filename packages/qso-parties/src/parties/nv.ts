// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DIVERGES from app-polo, deliberately. polo's copy still carries 2025 dates
// and no rules URL. These dates are DERIVED from the sponsor's standing rule
// (the second weekend in October), because their own site still shows 2025 —
// so re-read them before the event rather than trusting them outright.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/nv.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./nv.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "nvqp",
  name: "Nevada QSO Party",
  short: "NVQP",
  // The bundled extension's own pair for this party, which nothing rewrites.
  legacyRefs: [{ type: "qp", prefix: "nv" }],
  state: "NV",
  url: "http://nvqso.com/contest-rules/",
  status: "Dates DERIVED from the sponsor’s standing rule (second weekend in October); their site still shows 2025",
  lastUpdated: "2026-09-06 12:00Z",
  periods: [
    // 2026-10-10 03:00Z — 2026-10-11 21:00Z
    { startMillis: 1791601200000, endMillis: 1791752400000 },
  ],
  counties,
}
