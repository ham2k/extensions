// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT
import { createHistoryCallFilter } from '../../../../../packages/spot-filters/src/index.ts'
import { callLookupKeys } from '../history/callsign.ts'
import { tFor } from '../i18n.ts'
import { fileCache } from './hooks.ts'

// Temporary transport only. Keep cached history and callsign matching when
// native candidate relevance replaces this hook; never gate QSO points on history.
// Migration: packages/spot-filters/README.md.
// The supplying extension preserves operator choices; CWT never selects itself.
export const callFilter = createHistoryCallFilter({
  label: (ctx) => tFor(ctx)('spotsFilterLabel'),
  unavailableReason: (ctx) => tFor(ctx)('historyEmpty'),
  async records() {
    await fileCache.load()
    return fileCache.current()?.parsed.records
  },
  lookupKeys: callLookupKeys,
})
