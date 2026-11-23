// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { gzipSync } from 'node:zlib'
import type { FetchOptions } from '@ham2k/extension-sdk'
import { createLotwHostAdapters, maxLotwRequestBytes } from './host.ts'
import { type LotwUploadRequest, uploadLotwTq8 } from './upload.ts'

const entropyFailure = /^Secure randomness is unavailable for LoTW signing\.$/
const invalidRequest = /^Could not prepare the LoTW upload request, so nothing was sent\.$/

function makeHost() {
  return {
    randomBytes: mock.fn(async (length: number) => new Uint8Array(length).fill(0x8b)),
    fetch: mock.fn(async (_url: string, _options?: FetchOptions) => ({
      status: 200,
      body: '<!-- .UPL. accepted -->',
    })),
  }
}

function makeRequest(body = new Uint8Array([0, 0x8b, 0xff])): LotwUploadRequest {
  return {
    url: 'https://lotw.arrl.org/lotw/upload',
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'multipart/form-data; boundary=synthetic' },
    body,
    timeout: 1234,
  }
}

test('adapter creation reads no credentials, fetches nothing, and consumes no entropy', () => {
  const host = makeHost()
  createLotwHostAdapters(host)
  assert.equal(host.randomBytes.mock.callCount(), 0)
  assert.equal(host.fetch.mock.callCount(), 0)
})

for (const length of [1, 256, 4096]) {
  test(`gets exactly ${length} secure bytes through the host`, async () => {
    const host = makeHost()
    const adapters = createLotwHostAdapters(host)
    const first = await adapters.randomBytes(length)
    const second = await adapters.randomBytes(length)
    assert.ok(first instanceof Uint8Array)
    assert.equal(first.length, length)
    assert.equal(
      first.every((byte) => byte === 0x8b),
      true,
    )
    assert.notEqual(second, first)
    assert.deepEqual(
      host.randomBytes.mock.calls.map((call) => call.arguments),
      [[length], [length]],
    )
    assert.equal(host.fetch.mock.callCount(), 0)
  })
}

for (const length of [0, -1, 4097, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`refuses invalid entropy length ${length} before calling the host`, async () => {
    const host = makeHost()
    await assert.rejects(createLotwHostAdapters(host).randomBytes(length), {
      message: entropyFailure,
    })
    assert.equal(host.randomBytes.mock.callCount(), 0)
  })
}

for (const answer of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(5)]) {
  test(`refuses a host entropy answer with the wrong length (${answer.length})`, async () => {
    const host = makeHost()
    host.randomBytes.mock.mockImplementation(async () => answer)
    await assert.rejects(createLotwHostAdapters(host).randomBytes(4), {
      message: entropyFailure,
    })
    assert.equal(host.randomBytes.mock.callCount(), 1)
  })
}

test('refuses non-byte entropy and does not fall back to another source', async () => {
  const randomBytes = mock.fn(async (_length: number) => [1, 2, 3, 4] as unknown as Uint8Array)
  await assert.rejects(createLotwHostAdapters({ ...makeHost(), randomBytes }).randomBytes(4), {
    message: entropyFailure,
  })
  assert.equal(randomBytes.mock.callCount(), 1)
})

test('redacts secure-source failures without retrying', async () => {
  const host = makeHost()
  host.randomBytes.mock.mockImplementation(async () => {
    throw new Error('private key and certificate password')
  })
  await assert.rejects(createLotwHostAdapters(host).randomBytes(32), {
    message: entropyFailure,
  })
  assert.equal(host.randomBytes.mock.callCount(), 1)
})

test('forwards only the selected byte view, timeout and redirect refusal to the original URL', async () => {
  const host = makeHost()
  const body = new Uint8Array([99, 0, 0x8b, 0xff, 77]).subarray(1, 4)
  const request = makeRequest(body)
  assert.deepEqual(await createLotwHostAdapters(host).transport(request), {
    status: 200,
    body: '<!-- .UPL. accepted -->',
  })
  assert.deepEqual(
    host.fetch.mock.calls.map((call) => call.arguments),
    [
      [
        'https://lotw.arrl.org/lotw/upload',
        {
          method: 'POST',
          headers: request.headers,
          body,
          redirect: 'error',
          timeout: 1234,
        },
      ],
    ],
  )
  assert.equal(host.fetch.mock.calls[0].arguments[1]?.body, body)
  assert.deepEqual(host.fetch.mock.calls[0].arguments[1]?.body, new Uint8Array([0, 0x8b, 0xff]))
  assert.equal(host.randomBytes.mock.callCount(), 0)
  assert.deepEqual(request, makeRequest(body))
})

test('carries the signed-file multipart payload through the SDK seam byte for byte', async () => {
  const host = makeHost()
  const tq8 = gzipSync(new Uint8Array([0, 0x8b, 0xff]))
  assert.deepEqual(await uploadLotwTq8(tq8, createLotwHostAdapters(host).transport), {
    state: 'queued',
  })
  assert.equal(host.fetch.mock.callCount(), 1)
  const [url, options] = host.fetch.mock.calls[0].arguments
  assert.equal(url, 'https://lotw.arrl.org/lotw/upload')
  const bytes = options?.body
  assert.ok(bytes instanceof Uint8Array)
  const requestBody = Buffer.from(bytes)
  const partStart = requestBody.indexOf('\r\n\r\n') + 4
  assert.deepEqual(requestBody.subarray(partStart, partStart + tq8.byteLength), tq8)
  assert.equal(options?.redirect, 'error')
  assert.equal(options?.timeout, 30_000)
  assert.equal(host.randomBytes.mock.callCount(), 0)
})

test('accepts the 16 MiB request limit and refuses one byte more before HTTP', async () => {
  const host = makeHost()
  const transport = createLotwHostAdapters(host).transport
  const limit = new Uint8Array(maxLotwRequestBytes)
  assert.equal((await transport(makeRequest(limit))).status, 200)
  assert.equal(host.fetch.mock.calls[0].arguments[1]?.body, limit)
  await assert.rejects(transport(makeRequest(new Uint8Array(maxLotwRequestBytes + 1))), {
    message: invalidRequest,
  })
  assert.equal(host.fetch.mock.callCount(), 1)
})

for (const overrides of [
  { url: 'https://services.ham2k.net/lotw.arrl.org/lotw/upload' },
  { method: 'GET' },
  { redirect: 'follow' },
  { body: 'base64 is not an upload body' },
  { timeout: 0 },
  { timeout: Number.NaN },
  { headers: { 'Content-Type': '' } },
]) {
  test(`refuses invalid upload options before HTTP: ${JSON.stringify(overrides)}`, async () => {
    const host = makeHost()
    const request = { ...makeRequest(), ...overrides } as unknown as LotwUploadRequest
    await assert.rejects(createLotwHostAdapters(host).transport(request), {
      message: invalidRequest,
    })
    assert.equal(host.fetch.mock.callCount(), 0)
  })
}

for (const message of [
  'redirect refused: private Location',
  'lost connection with private response',
]) {
  test(`redacts host failures, treats delivery as uncertain and never retries: ${message}`, async () => {
    const host = makeHost()
    host.fetch.mock.mockImplementation(async () => {
      throw new Error(message)
    })
    const adapters = createLotwHostAdapters(host)
    await assert.rejects(adapters.transport(makeRequest()), {
      message: /^LoTW did not acknowledge the upload\. It may already have reached the server\.$/,
    })
    assert.equal(host.fetch.mock.callCount(), 1)
    host.fetch.mock.resetCalls()
    assert.deepEqual(await uploadLotwTq8(gzipSync('synthetic contacts'), adapters.transport), {
      state: 'unknown',
      reason: 'transport',
    })
    assert.equal(host.fetch.mock.callCount(), 1)
  })
}
