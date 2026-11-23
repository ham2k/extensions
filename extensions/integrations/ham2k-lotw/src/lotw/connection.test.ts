// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { gzipSync } from 'node:zlib'
import type { FetchOptions, HookContext, PushRecord, PushScope } from '@ham2k/extension-sdk'
import vector from '../fixtures/vector.json' with { type: 'json' }
import { createLotwConnection } from './connection.ts'
import type { LotwSigningPort } from './signing.ts'
import { createLotwTransferHook } from './transfer.ts'

const now = Date.parse('2027-01-01T00:00:00Z')
const password = 'synthetic-certificate-password'
const credentials = { certificate: 'AQID', certificatePassword: password }
const context: HookContext = { online: true, account: { credentials } }

function record(): PushRecord {
  const fields = {
    CALL: 'K1ABC',
    QSO_DATE: '20261022',
    TIME_ON: '123456',
    BAND: '20m',
    MODE: 'FT8',
    FREQ: '14.074',
    STATION_CALLSIGN: 'W1AW',
    MY_DXCC: '291',
    MY_GRIDSQUARE: 'FN31pr',
    MY_STATE: 'CT',
    MY_CNTY: 'CT,Tolland',
    MY_CQ_ZONE: '5',
    MY_ITU_ZONE: '8',
  }
  return {
    uuid: 'chasing-contact',
    adif: [
      `${Object.entries(fields)
        .map(([key, value]) => `<${key}:${value.length}>${value}`)
        .join('')}<EOR>`,
    ],
  }
}

function fixture() {
  const signing = {
    certificate: {
      derBase64: 'BAUG',
      serial: '1',
      callsign: 'W1AW',
      dxcc: 291,
      validFromMillis: Date.parse('2025-01-01T00:00:00Z'),
      validToMillis: Date.parse('2030-01-01T00:00:00Z'),
      qsoFrom: '2025-01-01',
    },
    signSha1: mock.fn(async (_canonicalAscii: string) => vector.signatureBase64),
    gzip: mock.fn(async (ascii: string): Promise<Uint8Array> => gzipSync(ascii)),
  } satisfies LotwSigningPort
  const host = {
    randomBytes: mock.fn(async (length: number) => new Uint8Array(length).fill(7)),
    fetch: mock.fn(async (_url: string, _options?: FetchOptions) => ({
      status: 200,
      body: '<!-- .UPL. accepted -->',
    })),
  }
  const loadCertificate = mock.fn(
    async (
      _p12: Uint8Array,
      _password: string,
      _ctx: HookContext,
      randomBytes: (length: number) => Promise<Uint8Array>,
    ) => {
      // Synthetic provider: exercise the supplied source rather than use
      // ambient entropy. This fixture does not parse a real certificate.
      await randomBytes(32)
      return signing
    },
  )
  const connection = createLotwConnection({
    host,
    loadCertificate,
    realNowMillis: () => now,
  })
  return { connection, host, loadCertificate, signing }
}

test('account Test validates the entered file rather than a previously saved account', async () => {
  const f = fixture()
  const result = await f.connection.account.testCredentials(credentials, {
    ...context,
    account: { credentials: { certificate: 'BwgJ', certificatePassword: 'old-password' } },
  })
  assert.match(result, /W1AW/)
  assert.deepEqual(f.loadCertificate.mock.calls[0]?.arguments.slice(0, 2), [
    new Uint8Array([1, 2, 3]),
    password,
  ])
  assert.ok(f.host.randomBytes.mock.calls.some((call) => call.arguments[0] === 32))
  assert.equal(f.host.fetch.mock.callCount(), 0)
})

test('connect reloads secure account credentials without retaining the previous file or password', async () => {
  const f = fixture()
  await f.connection.connect(context)
  await f.connection.connect({
    ...context,
    account: { credentials: { certificate: 'BwgJ', certificatePassword: 'replacement-password' } },
  })
  assert.deepEqual(
    f.loadCertificate.mock.calls.map((call) => call.arguments.slice(0, 2)),
    [
      [new Uint8Array([1, 2, 3]), password],
      [new Uint8Array([7, 8, 9]), 'replacement-password'],
    ],
  )
  assert.equal(f.host.fetch.mock.callCount(), 0)
})

test('composes secure account, entropy, signing and binary transport for a chasing push', async () => {
  const f = fixture()
  const hook = createLotwTransferHook(f.connection)
  const scope: PushScope = { kind: 'chasing', stationCall: 'W1AW' }
  const destinations = await hook.suggestDestinations(
    { service: 'lotw', scope, stationCalls: ['W1AW'] },
    context,
  )
  assert.deepEqual(destinations, [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }])
  assert.deepEqual(
    await hook.push(
      {
        service: 'lotw',
        stationCall: 'W1AW',
        destination: destinations[0],
        records: [record()],
      },
      context,
    ),
    [{ uuid: 'chasing-contact' }],
  )
  assert.equal(f.host.fetch.mock.callCount(), 1)
  const [url, options] = f.host.fetch.mock.calls[0].arguments
  assert.equal(url, 'https://lotw.arrl.org/lotw/upload')
  assert.equal(options?.method, 'POST')
  assert.equal(options?.redirect, 'error')
  const body = options?.body
  if (!(body instanceof Uint8Array)) throw new Error('Expected a binary upload body')
  assert.ok(f.signing.signSha1.mock.calls.some((call) => call.arguments[0] === vector.canonical))
  assert.ok(!Buffer.from(body).toString('ascii').includes(password))
})

test('an unavailable secure source stops connection before any upload', async () => {
  const f = fixture()
  f.host.randomBytes.mock.mockImplementation(async () => {
    throw new Error(`provider included ${password}`)
  })
  await assert.rejects(f.connection.connect(context), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.ok(!error.message.includes(password))
    return true
  })
  assert.equal(f.host.fetch.mock.callCount(), 0)
})

test('a lost upload reply stops without retrying or exposing provider errors', async () => {
  const f = fixture()
  f.host.fetch.mock.mockImplementation(async () => {
    throw new Error(`provider included ${password}`)
  })
  const hook = createLotwTransferHook(f.connection)
  await assert.rejects(
    hook.push(
      {
        service: 'lotw',
        stationCall: 'W1AW',
        destination: { id: 'w1aw', stationCall: 'W1AW' },
        records: [record()],
      },
      context,
    ),
    { message: /LoTW did not acknowledge/ },
  )
  assert.equal(f.host.fetch.mock.callCount(), 1)
})
