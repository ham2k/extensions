// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import type { DownloadTimers, Fetcher } from './source.ts'
import {
  DEFAULT_SOURCE,
  latestEntry,
  sourceText,
  sourceValidationError,
} from './source.ts'

const entryUrl = 'https://n1mmwp.hamdocs.com/mmfiles/cwops_4321-new-txt/'
const downloadUrl = 'https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS_4321-NEW.txt'
const listing = `<!DOCTYPE html><html><body>
  <a href="https://n1mmwp.hamdocs.com/mmfiles/naqp_2026-txt/">NAQP</a>
  <a class="cmdm-link" href="${entryUrl}">CWOPS_4321-NEW.txt</a>
  <a href="https://n1mmwp.hamdocs.com/mmfiles/cwops_3992-aaa-txt/">Older entry</a>
</body></html>`
const raw = '!!Order!!,Call,Name,Exch1,UserText,\n# CWOPS\nK1ABC,Pat,123,Somewhere'

function form(nonce = 'fresh-nonce') {
  return `<!DOCTYPE html><html><body>
    <form action="/search"><input name="q" value="irrelevant"></form>
    <form method="post" class="CMDM-downloadForm" action="${downloadUrl}">
      <input type="hidden" name="cmdm_nonce" value="${nonce}" />
      <input type="hidden" name="id" value="241902" />
      <input type="hidden" name="shortcodeId" value="changing-shortcode" />
      <input type="hidden" name="backurl" value="/mmfiles/cwops_4321-new-txt/?x=1&amp;y=2" />
      <input type="submit" value="Download" />
    </form>
  </body></html>`
}

function unexpectedFetch(): ReturnType<typeof mock.fn<Fetcher>> {
  return mock.fn<Fetcher>(async () => { throw new Error('Unexpected network request') })
}

function downloadTimers() {
  let elapsed = 0
  let nextHandle = 0
  const pending = new Map<number, { at: number; callback: () => void }>()
  const timers: DownloadTimers = {
    setTimeout: mock.fn((callback: () => void, delay: number) => {
      const handle = ++nextHandle
      pending.set(handle, { at: elapsed + delay, callback })
      return handle
    }),
    clearTimeout: mock.fn((handle: number) => { pending.delete(handle) }),
  }
  return {
    ...timers,
    advance(ms: number) {
      elapsed += ms
      for (const [handle, timer] of pending) {
        if (timer.at <= elapsed) {
          pending.delete(handle)
          timer.callback()
        }
      }
    },
    pending: () => pending.size,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('N1MM source discovery', () => {
  it('handles relative links, attribute order/case, single quotes, querystrings, and entities', () => {
    assert.equal(
      latestEntry(
        "<A class='entry' HREF='/mmfiles/CWOPS_5555-next-txt/?x=1&amp;y=2'>File</A>",
        DEFAULT_SOURCE,
      ),
      'https://n1mm.hamdocs.com/mmfiles/CWOPS_5555-next-txt/?x=1&y=2',
    )
  })

  it('discovers the newest entry when WordPress appends a duplicate-slug number', () => {
    const duplicateEntry = 'https://n1mmwp.hamdocs.com/mmfiles/cwops_4321-new-txt-2/'
    assert.equal(
      latestEntry(listing.replace(entryUrl, duplicateEntry), DEFAULT_SOURCE),
      duplicateEntry,
    )
  })

  it('gets the current entry then POSTs its current nonce with a bounded request timeout', async () => {
    const fetch = unexpectedFetch()
    const entry = form('token+with&amp;symbols')
      .replace(downloadUrl, '/mmfile/get/file/CWOPS_4321-NEW.txt')
    fetch.mock.mockImplementationOnce(async () => ({ status: 200, body: entry }), 0)
    fetch.mock.mockImplementationOnce(async () => ({ status: 200, body: raw }), 1)
    const timers = downloadTimers()
    assert.deepEqual(await sourceText(listing, DEFAULT_SOURCE, fetch, timers), { body: raw, url: downloadUrl })
    assert.deepEqual(fetch.mock.calls.map((call) => call.arguments), [
      [entryUrl, { timeout: 8000 }],
      [downloadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: [
          'cmdm_nonce=token%2Bwith%26symbols',
          'id=241902',
          'shortcodeId=changing-shortcode',
          'backurl=%2Fmmfiles%2Fcwops_4321-new-txt%2F%3Fx%3D1%26y%3D2',
        ].join('&'),
        timeout: 8000,
      }],
    ])
    assert.equal(timers.pending(), 0)
  })

  it('accepts a selected entry page directly, with only its POST request and the full download budget', async () => {
    const fetch = mock.fn<Fetcher>(async () => ({ status: 200, body: raw }))
    await sourceText(form(), entryUrl, fetch, downloadTimers())
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(fetch.mock.calls[0]?.arguments[0], downloadUrl)
    assert.equal(fetch.mock.calls[0]?.arguments[1]?.timeout, 8000)
  })

  it('shares one deadline across entry discovery and download while Date is frozen', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 })
    const timers = downloadTimers()
    const post = deferred<Awaited<ReturnType<Fetcher>>>()
    const fetch = unexpectedFetch()
    fetch.mock.mockImplementationOnce(async () => {
      timers.advance(4200)
      return { status: 200, body: form() }
    }, 0)
    fetch.mock.mockImplementationOnce(async () => post.promise, 1)

    const result = sourceText(listing, DEFAULT_SOURCE, fetch, timers)
    await flushPromises()
    assert.equal(fetch.mock.callCount(), 2)
    assert.equal(fetch.mock.calls[0]?.arguments[1]?.timeout, 8000)
    assert.equal(fetch.mock.calls[1]?.arguments[1]?.timeout, 8000)
    timers.advance(3799)
    assert.equal(timers.pending(), 1)
    timers.advance(1)
    await assert.rejects(result, /N1MM download timed out\. Previous data retained/)
    post.resolve({ status: 200, body: raw })
    await flushPromises()
    assert.equal(Date.now(), 0)
    assert.equal(timers.pending(), 0)
  })

  it('does not start the POST when entry discovery returns after the download deadline', async () => {
    const timers = downloadTimers()
    const entry = deferred<Awaited<ReturnType<Fetcher>>>()
    const fetch = mock.fn<Fetcher>(async () => entry.promise)
    const result = sourceText(listing, DEFAULT_SOURCE, fetch, timers)

    timers.advance(8000)
    await assert.rejects(result, /N1MM download timed out\. Previous data retained/)
    entry.resolve({ status: 200, body: form() })
    await flushPromises()
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(timers.pending(), 0)
  })

  it('accepts a download taking longer than the old per-request timeout within the shared budget', async () => {
    const timers = downloadTimers()
    const fetch = mock.fn<Fetcher>(async () => {
      timers.advance(4200)
      return { status: 200, body: raw }
    })

    assert.deepEqual(await sourceText(form(), entryUrl, fetch, timers), { body: raw, url: downloadUrl })
    assert.equal(fetch.mock.calls[0]?.arguments[1]?.timeout, 8000)
    assert.equal(timers.pending(), 0)
  })

  it('never publishes a download response arriving after the deadline', async () => {
    const timers = downloadTimers()
    const post = deferred<Awaited<ReturnType<Fetcher>>>()
    const fetch = mock.fn<Fetcher>(async () => post.promise)
    const publish = mock.fn()
    const result = sourceText(form(), entryUrl, fetch, timers).then(publish)

    timers.advance(8000)
    await assert.rejects(result, /N1MM download timed out\. Previous data retained/)
    post.resolve({ status: 200, body: raw })
    await flushPromises()
    assert.equal(publish.mock.callCount(), 0)
    assert.equal(timers.pending(), 0)
  })

  it('bounds discovery requests on older supported hosts without timers', async () => {
    const timers = {
      setTimeout: mock.fn((_callback: () => void, _delay: number) => 0),
      clearTimeout: mock.fn((_handle: number) => {}),
    }
    const fetch = mock.fn<Fetcher>(async (url) => ({
      status: 200,
      body: url === entryUrl ? form() : raw,
    }))

    assert.deepEqual(await sourceText(listing, DEFAULT_SOURCE, fetch, timers), { body: raw, url: downloadUrl })
    assert.deepEqual(fetch.mock.calls.map((call) => call.arguments[1]?.timeout), [4500, 4500])
    assert.equal(timers.clearTimeout.mock.callCount(), 0)
  })

  it('gives a selected entry eight seconds on older supported hosts without clearing a zero timer', async () => {
    const timers = {
      setTimeout: mock.fn((_callback: () => void, _delay: number) => 0),
      clearTimeout: mock.fn((_handle: number) => {}),
    }
    const fetch = mock.fn<Fetcher>(async () => ({ status: 200, body: raw }))

    assert.deepEqual(await sourceText(form(), entryUrl, fetch, timers), { body: raw, url: downloadUrl })
    assert.equal(fetch.mock.calls[0]?.arguments[1]?.timeout, 8000)
    assert.equal(timers.clearTimeout.mock.callCount(), 0)
  })

  it('accepts blank/default settings and passes direct HTTPS text through without fetching', async () => {
    assert.equal(sourceValidationError('  '), null)
    assert.equal(sourceValidationError(DEFAULT_SOURCE), null)
    const fetch = unexpectedFetch()
    const timers = downloadTimers()
    assert.deepEqual(await sourceText(raw, downloadUrl, fetch, timers), { body: raw, url: downloadUrl })
    assert.equal(fetch.mock.callCount(), 0)
    assert.equal(timers.pending(), 0)
  })

  for (const url of ['/tmp/CWOPS.txt', 'file:///tmp/CWOPS.txt', 'http://n1mm.hamdocs.com/file.txt']) {
    it(`rejects unsupported source ${url} instead of promising local file access`, async () => {
      const fetch = unexpectedFetch()
      assert.match(sourceValidationError(url) ?? '', /Local file paths are not supported/)
      await assert.rejects(sourceText(raw, url, fetch, downloadTimers()), /Local file paths are not supported/)
      assert.equal(fetch.mock.callCount(), 0)
    })
  }

  it('reports changed listing or form markup instead of guessing a stale URL or nonce', async () => {
    const fetch = unexpectedFetch()
    const timers = downloadTimers()
    await assert.rejects(sourceText('<html>No current file</html>', DEFAULT_SOURCE, fetch, timers), /No CWOPS entry/)
    await assert.rejects(
      sourceText(form().replace('name="cmdm_nonce"', 'name="new_nonce"'), entryUrl, fetch, timers),
      /download form has changed/,
    )
    assert.equal(fetch.mock.callCount(), 0)
    assert.equal(timers.pending(), 0)
  })

  for (const origin of [
    'https://evil.example',
    'http://n1mm.hamdocs.com',
    'https://n1mm.hamdocs.com.evil.example',
  ]) {
    it(`refuses linked non-N1MM host ${origin} before calling fetch`, async () => {
      const fetch = unexpectedFetch()
      const hostileListing = `<html><a href="${origin}/mmfiles/cwops_9999-txt/">CWOPS</a></html>`
      await assert.rejects(sourceText(hostileListing, DEFAULT_SOURCE, fetch, downloadTimers()), /unsupported download host/)
      const hostileForm = form().replace(downloadUrl, `${origin}/mmfile/get/file/CWOPS.txt`)
      await assert.rejects(sourceText(hostileForm, entryUrl, fetch, downloadTimers()), /unsupported download host/)
      assert.equal(fetch.mock.callCount(), 0)
    })
  }

  it('propagates network, entry GET, and download POST failures', async () => {
    const offline = mock.fn<Fetcher>(async () => { throw new Error('offline') })
    const timers = downloadTimers()
    await assert.rejects(sourceText(form(), entryUrl, offline, timers), /offline/)
    const unavailable = mock.fn<Fetcher>(async () => ({ status: 503, body: 'Unavailable' }))
    await assert.rejects(sourceText(listing, DEFAULT_SOURCE, unavailable, timers), /HTTP 503/)
    assert.equal(unavailable.mock.callCount(), 1)
    const denied = unexpectedFetch()
    denied.mock.mockImplementationOnce(async () => ({ status: 200, body: form() }), 0)
    denied.mock.mockImplementationOnce(async () => ({ status: 403, body: 'Denied' }), 1)
    await assert.rejects(sourceText(listing, DEFAULT_SOURCE, denied, timers), /HTTP 403/)
    assert.equal(denied.mock.callCount(), 2)
    assert.equal(timers.pending(), 0)
  })
})
