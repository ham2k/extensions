// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { it, mock } from 'node:test'
import { host } from '@ham2k/extension-sdk'
import manifest from '../../manifest.json' with { type: 'json' }
import { loadExtension } from '../sdkGapTesting.ts'
import { DataFile, fileCache } from './hooks.ts'
import type { Snapshot } from './cache.ts'
import { DEFAULT_SOURCE } from './source.ts'

const getSettings = mock.fn(() => ({
  extensions: { 'extension_ham2k-cwt': { source: 'https://n1mmwp.hamdocs.com/old-CWOPS.txt' } },
}))
const setSettings = mock.fn(() => { throw new Error('Automatic call history must not change settings') })
const cwt = await loadExtension(() => import('../index.ts'), {
  hostCalls: { getSettings, setSettings },
})

it('registers automatic call history without a source-override settings page', async (t) => {
  assert.equal(cwt.categories().includes('settingsPanel'), false)
  assert.equal(manifest.hooks.includes('settingsPanel'), false)
  assert.equal(DataFile.url, DEFAULT_SOURCE)
  assert.equal(DataFile.maxAgeInDays, 1)

  const settings = t.mock.method(host, 'getSettings', async () => ({
    extensions: { 'extension_ham2k-cwt': { source: 'https://n1mmwp.hamdocs.com/old-CWOPS.txt' } },
  }))
  const body = '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Al,4567\n'
  for (const source of ['https://n1mmwp.hamdocs.com/old-CWOPS.txt', '/tmp/CWOPS.txt']) {
    settings.mock.mockImplementation(async () => ({
      extensions: { 'extension_ham2k-cwt': { source } },
    }))
    assert.equal(DataFile.url, DEFAULT_SOURCE)
    await cwt.runHook('dataFile', 'rawToJSONData', { body, url: DEFAULT_SOURCE })
  }
  assert.equal(settings.mock.callCount(), 0)
  assert.equal(getSettings.mock.callCount(), 0)
  assert.equal(setSettings.mock.callCount(), 0)
})

it('keeps native snapshot replay and the last good file after failed refreshes', async (t) => {
  const snapshot = await cwt.runHook('dataFile', 'rawToJSONData', {
    body: '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Al,4567\n',
    url: DEFAULT_SOURCE,
  }) as Snapshot
  await cwt.runHook('dataFile', 'onRemoveRawData')
  assert.equal(fileCache.current(), undefined)
  await cwt.runHook('dataFile', 'onLoadRawData', snapshot)
  assert.equal(fileCache.current()?.parsed.records.K1ABC?.number, '4567')

  await assert.rejects(cwt.runHook('dataFile', 'rawToJSONData', {
    body: '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Al,?\n',
    url: DEFAULT_SOURCE,
  }), /Invalid CWT file/)
  assert.deepEqual(fileCache.current()?.snapshot, snapshot)

  t.mock.method(host, 'fetch', async () => { throw new Error('offline') })
  await assert.rejects(cwt.runHook('dataFile', 'rawToJSONData', {
    body: '<html><a href="https://n1mmwp.hamdocs.com/mmfiles/cwops_test-txt/">CWOPS</a></html>',
    url: DEFAULT_SOURCE,
  }), /received HTML/)
  assert.deepEqual(fileCache.current()?.snapshot, snapshot)
})
