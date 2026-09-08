// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The sponsor's contest page is gone (404) and app-polo marks this party
// `disabled`; its dates are still 2025 and nothing here re-derives them. The
// parameters are complete and the party is operable, but nothing has been
// verified against a sponsor — do not publish an extension from this file
// until someone has.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this from
// `fixtures/ns.json`. Edit the fixture and re-run; an edit here is lost
// on the next re-sync.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import counties from "./ns.counties.json" with { type: "json" }

export const PARTY: QsoPartyParams = {
  refType: "nsara-contest-qso-party",
  name: "NSARA Contest (QSO Party)",
  short: "NSARA",
  state: "NS",
  url: "http://nsara.ca/",
  status: "Not supported",
  lastUpdated: "2025-02-21 12:00Z",
  periods: [
    // 2025-3-2 12:00Z — 2025-3-2 15:59Z
    { startMillis: 1740916800000, endMillis: 1740931140000 },
    // 2025-3-2 18:00Z — 2025-3-2 21:59Z
    { startMillis: 1740938400000, endMillis: 1740952740000 },
  ],
  entity: "VE",
  selfCountsForCounty: true,
  dxIsMultiplier: true,
  multsPerMode: true,
  bonus: {
    perActivatedCounty: 100,
    perActivatedCountyRoverOnly: true,
  },
  pointsByMode: { PHONE: 1, CW: 1, DATA: 1 },
  counties,
}
