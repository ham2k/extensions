// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Settings } from './hooks.ts'

it('groups the localized prefill dialog under Activities and retains its data-file shortcut', async () => {
  for (const [locale, title] of [['en', 'CWT Prefill'], ['es', 'Autocompletado CWT']]) {
    assert.deepEqual(await Settings.getPanels?.({}, { online: false, locale }), [
      { key: 'ham2k-cwt', title, icon: 'clock-fast', section: 'activities', dataFilesSection: true },
    ])
  }
})
