// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { checkedSnapshot, createFileCache } from './cache.ts'
const body = '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Pat,123'
const snapshot = { schema: 1 as const, body, url: 'n1mm-history:CWOPS', fetchedAt: '2026-10-29T12:00:00Z' }
it('replays native persisted JSON offline and clears it through native controls', async () => {
  const cache = createFileCache()
  const saved = await cache.replace(snapshot)
  const offline = createFileCache()
  offline.accept(JSON.parse(JSON.stringify(saved)))
  assert.deepEqual(offline.current(), cache.current())
  await offline.remove()
  assert.equal(offline.current(), undefined)
})
it('retains the last good history after invalid or stale replay and refresh', async () => {
  const cache = createFileCache()
  await cache.replace(snapshot)
  for (const invalid of [null, {}, { ...snapshot, schema: 2 },
    { ...snapshot, fetchedAt: 'invalid' }, { ...snapshot, body: '<html>Error</html>' },
    { ...snapshot, body: '# NAQPCW\nK1ABC,Pat' },
    { ...snapshot, body: `${body}\nCORRUPT` },
    { ...snapshot, body: 'x'.repeat(5_000_001) }]) {
    assert.throws(() => checkedSnapshot(invalid))
    cache.accept(invalid)
    assert.deepEqual(cache.current()?.snapshot, snapshot)
  }
  const older = { ...snapshot, body: body.replace('123', '456'), fetchedAt: '2026-10-29T13:00:00+02:00' }
  assert.deepEqual(await cache.replace(older), snapshot)
  await assert.rejects(cache.replace({ ...snapshot, body: '<html>Error</html>' }))
  assert.deepEqual(cache.current()?.snapshot, snapshot)
  await cache.replace(snapshot)
  assert.equal(cache.error(), undefined)
})
