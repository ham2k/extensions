// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { gzipSync } from 'node:zlib'
import type { HookContext, PushRecord, PushRequest, PushScope } from '@ham2k/extension-sdk'
import vector from '../fixtures/vector.json' with { type: 'json' }
import type { LotwSigningPort } from './signing.ts'
import { createLotwTransferHook } from './transfer.ts'
import type { LotwUploadRequest } from './upload.ts'

const nowMillis = Date.parse('2027-01-01T00:00:00Z')
const context: HookContext = { online: true }
const scope: PushScope = {
  kind: 'operation',
  operation: { uuid: 'operation', stationCall: 'W1AW' },
}

function adif(overrides: Record<string, string | undefined> = {}) {
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
    ...overrides,
  }
  return `${Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `<${name}:${value.length}>${value}`)
    .join('')}<EOR>`
}

function record(uuid: string, overrides: Record<string, string | undefined> = {}): PushRecord {
  return { uuid, adif: [adif(overrides)] }
}

type UploadReply = { status: number; body: string }

function fixture(connectMillis = 0) {
  let elapsedMillis = 0
  const signing = {
    certificate: {
      // A synthetic signer port. Wire-format cryptography has an independent
      // public-certificate vector in lotw.test.ts.
      derBase64: 'AQID',
      serial: '1',
      callsign: 'W1AW',
      dxcc: 291,
      validFromMillis: Date.parse('2025-01-01T00:00:00Z'),
      validToMillis: Date.parse('2030-01-01T00:00:00Z'),
      qsoFrom: '2025-01-01',
    },
    signSha1: mock.fn(async (_canonicalAscii: string) => vector.signatureBase64),
    gzip: mock.fn(async (text: string): Promise<Uint8Array> => gzipSync(text)),
  } satisfies LotwSigningPort
  const transport = mock.fn(
    async (_request: LotwUploadRequest): Promise<UploadReply> => ({
      status: 200,
      body: '<!-- .UPL. accepted -->',
    }),
  )
  const connect = mock.fn(async () => {
    elapsedMillis += connectMillis
    return { signing, transport, realNowMillis: () => nowMillis }
  })
  const hook = createLotwTransferHook({ connect, elapsedNowMillis: () => elapsedMillis })
  const request = (records: PushRecord[]): PushRequest => ({
    service: 'lotw',
    stationCall: 'W1AW',
    destination: { id: 'w1aw', stationCall: 'W1AW' },
    records,
  })
  return {
    hook,
    signing,
    transport,
    connect,
    request,
    advance(millis: number) {
      elapsedMillis += millis
    },
    push: (records: PushRecord[]) => hook.push(request(records), context),
  }
}

// Passes when any one call to `fn` received exactly `args`.
function assertCalledWith(fn: { mock: { calls: { arguments: unknown[] }[] } }, ...args: unknown[]) {
  assert.ok(
    fn.mock.calls.some((call) => isDeepStrictEqual(call.arguments, args)),
    `expected a call with ${JSON.stringify(args)}`,
  )
}

// Lets queued asynchronous work run until `condition` holds, and fails
// after a bounded number of event-loop turns rather than hanging.
async function waitFor(condition: () => boolean) {
  for (let turn = 0; turn < 100 && !condition(); turn++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.ok(condition(), 'condition was not reached')
}

const lotwPush = {
  key: 'lotw',
  service: 'lotw',
  label: 'Push to LoTW',
  select: { notSentTo: 'lotw' },
  payload: { full: true, includePrivateData: false, omit: ['app_*', 'notes', 'comment'] },
}

test('offers only unsent contacts and the certificate station destination', async () => {
  const f = fixture()
  assert.deepEqual(await f.hook.suggestPushes({ scope }, context), [lotwPush])
  assert.equal(f.connect.mock.callCount(), 0)
  assert.deepEqual(
    await f.hook.suggestDestinations(
      { service: 'lotw', scope, stationCalls: ['N1RWJ', 'W1AW'] },
      context,
    ),
    [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }],
  )
  assert.deepEqual(
    await f.hook.suggestDestinations({ service: 'lotw', scope, stationCalls: ['N1RWJ'] }, context),
    [],
  )
  assert.equal(f.transport.mock.callCount(), 0)
})

const logScopes: PushScope[] = [
  { kind: 'chasing', stationCall: 'W1AW' },
  { kind: 'log', stationCall: 'W1AW' },
  { kind: 'log' },
]

for (const scope of logScopes) {
  test(`offers unsent contacts without an operation in scope ${JSON.stringify(scope)}`, async () => {
    const f = fixture()
    const suggestions = await f.hook.suggestPushes({ scope }, context)
    assert.deepEqual(suggestions, [lotwPush])
    assert.equal(f.connect.mock.callCount(), 0)
    const destinations = await f.hook.suggestDestinations(
      { service: 'lotw', scope, stationCalls: ['N1RWJ', 'W1AW'] },
      context,
    )
    assert.deepEqual(destinations, [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }])
    assert.equal(f.transport.mock.callCount(), 0)
    // Chasing and Logs contacts have no synthetic operation or operation UUID.
    // Core supplies the same station-specific, prepared records to push.
    assert.deepEqual(await f.push([record('loose-contact')]), [{ uuid: 'loose-contact' }])
    assertCalledWith(f.signing.signSha1, vector.canonical)
    assert.equal(f.transport.mock.callCount(), 1)
  })
}

for (const kind of ['chasing', 'log'] as const) {
  test(`keeps a ${kind} callsign filter when other calls are present`, async () => {
    const f = fixture()
    assert.deepEqual(
      await f.hook.suggestDestinations(
        {
          service: 'lotw',
          scope: { kind, stationCall: 'N1RWJ' },
          stationCalls: ['N1RWJ', 'W1AW'],
        },
        context,
      ),
      [],
    )
    assert.equal(f.transport.mock.callCount(), 0)
  })
}

test('All Logs offers only a certificate call present in the supplied station calls', async () => {
  const f = fixture()
  for (const stationCalls of [[], ['N1RWJ'], ['W1AW/TEST']]) {
    assert.deepEqual(
      await f.hook.suggestDestinations(
        { service: 'lotw', scope: { kind: 'log' }, stationCalls },
        context,
      ),
      [],
    )
  }
  f.signing.certificate.callsign = 'W1AW/TEST'
  assert.deepEqual(
    await f.hook.suggestDestinations(
      { service: 'lotw', scope: { kind: 'log' }, stationCalls: ['W1AW/TEST'] },
      context,
    ),
    [],
  )
  assert.equal(f.transport.mock.callCount(), 0)
})

test('operation segments can offer a certificate call different from the operation default', async () => {
  const f = fixture()
  assert.deepEqual(
    await f.hook.suggestDestinations(
      {
        service: 'lotw',
        scope: { kind: 'operation', operation: { stationCall: 'N1RWJ' } },
        stationCalls: ['N1RWJ', 'W1AW'],
      },
      context,
    ),
    [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }],
  )
})

for (const stationCall of ['N1RWJ, W1AW', ' n1rwj , w1aw ']) {
  test(`offers the certificate destination for a multi-call operation: ${stationCall}`, async () => {
    const f = fixture()
    const scope: PushScope = { kind: 'operation', operation: { stationCall } }
    const suggestions = await f.hook.suggestPushes({ scope }, context)
    assert.equal(suggestions.length, 1)
    assert.partialDeepStrictEqual(suggestions[0], {
      service: 'lotw',
      select: { notSentTo: 'lotw' },
    })
    assert.deepEqual(
      await f.hook.suggestDestinations(
        { service: 'lotw', scope, stationCalls: ['N1RWJ', 'W1AW'] },
        context,
      ),
      [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }],
    )
  })
}

for (const input of [
  null,
  undefined,
  [],
  {},
  { kind: 'future' },
  { kind: 'operation' },
  { kind: 'operation', operation: {} },
  { kind: 'operation', operation: { stationCall: 'W1AW/TEST' } },
  { kind: 'operation', operation: { stationCall: 'W1AW, N1RWJ/T/P' } },
  { kind: 'operation', operation: { stationCall: 'W1AW, N1 RWJ' } },
  { kind: 'operation', operation: { stationCall: ' , ' } },
  { kind: 'chasing' },
  { kind: 'chasing', stationCall: null },
  { kind: 'chasing', stationCall: 123 },
  { kind: 'chasing', stationCall: ' W1AW' },
  { kind: 'chasing', stationCall: 'W1AW X' },
  { kind: 'chasing', stationCall: 'W1AW/TEST' },
  { kind: 'log', stationCall: '' },
  { kind: 'log', stationCall: null },
  { kind: 'log', stationCall: 'W1AW/TEST' },
]) {
  test(`refuses malformed, test and unknown scopes before connecting: ${JSON.stringify(input)}`, async () => {
    const f = fixture()
    const scope = input as PushScope
    assert.deepEqual(await f.hook.suggestPushes({ scope }, context), [])
    assert.deepEqual(
      await f.hook.suggestDestinations({ service: 'lotw', scope, stationCalls: ['W1AW'] }, context),
      [],
    )
    assert.equal(f.connect.mock.callCount(), 0)
  })
}

test('offers nothing for test operations, unknown scopes or another service', async () => {
  const f = fixture()
  const testing: PushScope = { kind: 'operation', operation: { stationCall: 'W1AW/TEST' } }
  const future = { kind: 'future' } as unknown as PushScope
  for (const candidate of [testing, future]) {
    assert.deepEqual(await f.hook.suggestPushes({ scope: candidate }, context), [])
    assert.deepEqual(
      await f.hook.suggestDestinations(
        { service: 'lotw', scope: candidate, stationCalls: ['W1AW'] },
        context,
      ),
      [],
    )
  }
  assert.deepEqual(
    await f.hook.suggestDestinations({ service: 'qrz', scope, stationCalls: ['W1AW'] }, context),
    [],
  )
  assert.equal(f.connect.mock.callCount(), 0)
})

// The contact in `overrides` is refused with `message`, and only that one:
// the good contact beside it is signed and sent alone. Without per-record
// refusal, one bad contact would fail its chunk on every later push.
async function refusedAlone(
  overrides: Record<string, string | undefined>,
  message: RegExp | string,
) {
  const f = fixture()
  const results = await f.push([record('good'), record('bad', overrides)])
  assert.deepEqual(results[0], { uuid: 'good' })
  assert.equal(results[1].uuid, 'bad')
  assert.equal(typeof results[1].error, 'string')
  if (typeof message === 'string') assert.equal(results[1].error, message)
  else assert.match(results[1].error ?? '', message)
  assert.equal(f.signing.signSha1.mock.callCount(), 1)
  assert.equal(f.transport.mock.callCount(), 1)
  return f
}

for (const [field, message] of [
  ['STATION_CALLSIGN', 'The contact has no station callsign.'],
  ['MY_DXCC', 'The contact has no DXCC entity for its station.'],
] as const) {
  test(`does not invent ${field} from a chasing scope or certificate`, async () => {
    const f = fixture()
    const chasing: PushScope = { kind: 'chasing', stationCall: 'W1AW' }
    assert.equal((await f.hook.suggestPushes({ scope: chasing }, context)).length, 1)
    assert.equal(
      (
        await f.hook.suggestDestinations(
          { service: 'lotw', scope: chasing, stationCalls: ['W1AW'] },
          context,
        )
      ).length,
      1,
    )
    await refusedAlone({ [field]: undefined }, message)
  })
}

for (const grid of [undefined, 'AA00', 'AA00AA']) {
  test(`signs a contact with no grid without inventing one: ${grid}`, async () => {
    // LoTW needs no grid, and AA00 stands for "no location" rather than a
    // place; refusing would hold back every contact logged without one.
    const f = fixture()
    assert.deepEqual(await f.push([record('one', { MY_GRIDSQUARE: grid })]), [{ uuid: 'one' }])
    assert.doesNotMatch(f.signing.gzip.mock.calls[0].arguments[0], /GRIDSQUARE/)
  })
}

for (const dxcc of [undefined, '291']) {
  test(`uses the verified destination for a standalone contact exported as UNKNOWN (DXCC ${dxcc})`, async () => {
    const f = fixture()
    assert.deepEqual(
      await f.push([record('chase', { STATION_CALLSIGN: 'UNKNOWN', MY_DXCC: dxcc })]),
      [{ uuid: 'chase' }],
    )
    assertCalledWith(f.signing.signSha1, vector.canonical)
    const tq8 = f.signing.gzip.mock.calls[0].arguments[0]
    assert.ok(tq8.includes('<CALL:4>W1AW'))
    assert.ok(tq8.includes('<DXCC:3>291'))
    assert.equal(f.transport.mock.callCount(), 1)
  })
}

for (const [overrides, message] of [
  [{ STATION_CALLSIGN: 'UNKNOWN', MY_DXCC: '1' }, /in DXCC entity 1, and the certificate for W1AW/],
  [
    { STATION_CALLSIGN: 'UNKNOWN', MY_DXCC: '', MY_GRIDSQUARE: 'FN31PR' },
    'The contact has no DXCC entity for its station.',
  ],
  [{ STATION_CALLSIGN: 'N1RWJ', MY_DXCC: undefined }, 'The contact was logged as N1RWJ, not W1AW.'],
] as const) {
  test(`keeps required station data safe when preparing ${JSON.stringify(overrides)}`, async () => {
    await refusedAlone(overrides, message)
  })
}

test('signs host-prepared ADIF and returns id-less receipts only after queue acknowledgement', async () => {
  const f = fixture()
  assert.deepEqual(
    await f.push([
      record('contact', { NOTES: 'Private <EOR> note', NAME: 'Private Name', APP_TEST: 'discard' }),
    ]),
    [{ uuid: 'contact' }],
  )
  assertCalledWith(f.signing.signSha1, vector.canonical)
  assert.equal(f.signing.gzip.mock.callCount(), 1)
  assert.doesNotMatch(f.signing.gzip.mock.calls[0].arguments[0], /Private|APP_TEST|NOTES|NAME/)
  assert.equal(f.transport.mock.callCount(), 1)
  assert.partialDeepStrictEqual(f.transport.mock.calls[0].arguments[0], {
    url: 'https://lotw.arrl.org/lotw/upload',
    method: 'POST',
    redirect: 'error',
    timeout: 30_000,
  })
})

test('combines consecutive contacts from one location and separates a changed location', async () => {
  const f = fixture()
  assert.deepEqual(
    await f.push([
      record('one'),
      record('two', { TIME_ON: '123457' }),
      record('three', { MY_GRIDSQUARE: 'FN32aa', MY_CNTY: undefined, TIME_ON: '123458' }),
    ]),
    [{ uuid: 'one' }, { uuid: 'two' }, { uuid: 'three' }],
  )
  assert.equal(f.transport.mock.callCount(), 2)
  const files = f.signing.gzip.mock.calls.map((call) => call.arguments[0])
  assert.equal(files[0].match(/<REC_TYPE:8>tCONTACT/g)?.length, 2)
  assert.ok(files[0].includes('<GRIDSQUARE:6>FN31PR'))
  assert.ok(files[1].includes('<GRIDSQUARE:6>FN32AA'))
  assert.ok(!files[1].includes('TOLLAND'))
})

test('reduces repeated program records for one contact without changing its signed identity', async () => {
  const f = fixture()
  assert.deepEqual(
    await f.push([
      {
        uuid: 'one',
        adif: [adif({ MY_POTA_REF: 'US-0001' }), adif({ MY_POTA_REF: 'US-0002' })],
      },
    ]),
    [{ uuid: 'one' }],
  )
  assert.equal(f.signing.signSha1.mock.callCount(), 1)

  assert.deepEqual(await f.push([{ uuid: 'mismatch', adif: [adif(), adif({ CALL: 'K2ABC' })] }]), [
    {
      uuid: 'mismatch',
      error: 'The contact’s references disagree on its station or details, so LoTW cannot sign it.',
    },
  ])
  assert.equal(f.transport.mock.callCount(), 1)
})

for (const [overrides, message] of [
  [{ MY_GRIDSQUARE: 'FN31PR,FN32AA' }, 'LoTW does not take the grid FN31PR,FN32AA.'],
  [{ MY_DXCC: undefined }, 'The contact has no DXCC entity for its station.'],
  [{ STATION_CALLSIGN: 'N1RWJ' }, 'The contact was logged as N1RWJ, not W1AW.'],
  [{ TIME_ON: '1234' }, 'The contact has no exact time, to the second, for LoTW.'],
  [{ MY_CNTY: 'MA,Tolland' }, 'LoTW does not take the county MA,TOLLAND for the state CT.'],
  [{ MY_DXCC: '1' }, /in DXCC entity 1, and the certificate for W1AW is for entity 291/],
  [{ MY_STATE: 'XX', MY_CNTY: undefined }, 'LoTW does not take the state XX.'],
  [{ QSO_DATE: '20260230' }, 'The contact has no valid date for LoTW.'],
  [{ MODE: 'UNSUPPORTED' }, 'LoTW does not take the mode UNSUPPORTED.'],
  [{ BAND: '11m' }, 'LoTW does not take the band 11M.'],
  [{ PROP_MODE: 'SAT' }, 'A satellite contact needs the satellite’s name for LoTW.'],
  [
    { QSO_DATE: '20241231' },
    'The contact’s date, 2024-12-31, is outside the dates the certificate for W1AW covers (from 2025-01-01).',
  ],
] as const) {
  test(`refuses only the contact LoTW would not take: ${JSON.stringify(overrides)}`, async () => {
    await refusedAlone(overrides, message)
  })
}

for (const [overrides, signed] of [
  [{ MODE: 'MFSK', SUBMODE: 'JS8' }, '<MODE:4>DATA'],
  [{ MODE: 'SSB', SUBMODE: 'USB' }, '<MODE:3>SSB'],
  [{ MODE: 'PKT' }, '<MODE:6>PACKET'],
  [{ MODE: 'OLIVIA', SUBMODE: 'OLIVIA 8/500' }, '<MODE:6>OLIVIA'],
  [{ MODE: 'JS8' }, '<MODE:4>DATA'],
  // A submode TQSL does not list signs as its mode would on its own.
  [{ MODE: 'MFSK', SUBMODE: 'FST4W' }, '<MODE:4>DATA'],
] as const) {
  test(`signs the mode TQSL maps ${JSON.stringify(overrides)} to`, async () => {
    // LoTW takes the modes in TQSL's configuration, not ADIF's own names:
    // what is signed is the mode TQSL would send.
    const f = fixture()
    assert.deepEqual(await f.push([record('one', overrides)]), [{ uuid: 'one' }])
    assert.ok(f.signing.gzip.mock.calls[0].arguments[0].includes(signed))
  })
}

test('signs DC as a US state', async () => {
  const f = fixture()
  assert.deepEqual(await f.push([record('one', { MY_STATE: 'DC', MY_CNTY: undefined })]), [
    { uuid: 'one' },
  ])
  assert.ok(f.signing.gzip.mock.calls[0].arguments[0].includes('<US_STATE:2>DC'))
})

test('leaves out a state LoTW has no field for, rather than refusing the contact', async () => {
  // The exporter writes the operation's state whatever the entity; LoTW
  // signs one only for the USA and Canada.
  const f = fixture()
  f.signing.certificate.dxcc = 150
  assert.deepEqual(
    await f.push([record('one', { MY_DXCC: '150', MY_STATE: 'NSW', MY_CNTY: 'NSW,Sydney' })]),
    [{ uuid: 'one' }],
  )
  assert.doesNotMatch(f.signing.gzip.mock.calls[0].arguments[0], /STATE|COUNTY|PROVINCE|NSW/)
})

test('a chunk whose contacts are all refused sends nothing', async () => {
  const f = fixture()
  const results = await f.push([record('one', { MODE: 'UNSUPPORTED' })])
  assert.equal(results.length, 1)
  assert.ok(results[0].error)
  assert.equal(f.signing.signSha1.mock.callCount(), 0)
  assert.equal(f.transport.mock.callCount(), 0)
})

test('signs every location before sending any of them', async () => {
  // A signer failure on a later location must not leave the first sent.
  const f = fixture()
  f.signing.signSha1.mock.mockImplementationOnce(async () => {
    throw new Error('signer failed')
  }, 1)
  await assert.rejects(f.push([record('one'), record('two', { MY_GRIDSQUARE: 'FN32AA' })]), {
    message:
      'Could not sign the contacts with the LoTW certificate for W1AW. Test the LoTW account in its settings.',
  })
  assert.equal(f.transport.mock.callCount(), 0)
})

test('refuses a delete and an empty record alone, and a malformed chunk whole', async () => {
  const f = fixture()
  assert.deepEqual(
    await f.push([
      { uuid: 'deleted', deleted: true, adif: [] },
      { uuid: 'empty', adif: [] },
      record('one'),
    ]),
    [
      { uuid: 'deleted', error: 'LoTW keeps no way to remove a contact once uploaded.' },
      { uuid: 'empty', error: 'Could not read this contact for LoTW.' },
      { uuid: 'one' },
    ],
  )
  // Duplicate ids and an oversized chunk are the host's mistake, not a
  // contact's: no result could say which record they belong to.
  for (const records of [
    [record('one'), record('one')],
    Array.from({ length: 26 }, (_, index) => record(String(index))),
  ]) {
    await assert.rejects(f.push(records), { message: /Could not prepare/ })
  }
  assert.equal(f.transport.mock.callCount(), 1)
})

test('rejects a wrong service/destination and offline execution', async () => {
  const f = fixture()
  for (const changes of [
    { service: 'qrz' },
    { stationCall: 'N1RWJ' },
    { destination: { id: 'other', stationCall: 'W1AW' } },
    { destination: { id: 'w1aw', stationCall: 'N1RWJ' } },
  ]) {
    await assert.rejects(f.hook.push({ ...f.request([record('one')]), ...changes }, context), {
      message: /must match/,
    })
  }
  await assert.rejects(f.hook.push(f.request([record('one')]), { online: false }), {
    message: /Connect to the internet/,
  })
  assert.equal(f.transport.mock.callCount(), 0)
})

for (const kind of ['rejected', 'unknown', 'transport'] as const) {
  test(`throws on the first ${kind} upload so core stops later chunks`, async () => {
    const f = fixture()
    if (kind === 'transport')
      f.transport.mock.mockImplementationOnce(async () => {
        throw new Error('secret request body')
      })
    else
      f.transport.mock.mockImplementationOnce(async () => ({
        status: 200,
        body: kind === 'rejected' ? '<!-- .UPL. rejected -->' : 'secret server reply',
      }))
    await assert.rejects(f.push([record('one'), record('two', { MY_GRIDSQUARE: 'FN32AA' })]), {
      message: kind === 'rejected' ? /LoTW refused/ : /LoTW did not acknowledge/,
    })
    assert.equal(f.transport.mock.callCount(), 1)
  })
}

test('throws after a later location fails, leaving the whole chunk for an operator retry', async () => {
  const f = fixture()
  f.transport.mock.mockImplementationOnce(
    async () => ({ status: 200, body: '<!-- .UPL. accepted -->' }),
    0,
  )
  f.transport.mock.mockImplementationOnce(async () => ({ status: 503, body: 'unavailable' }), 1)
  const records = [
    record('one'),
    record('two', { MY_GRIDSQUARE: 'FN32AA' }),
    record('three', { MY_GRIDSQUARE: 'FN33AA' }),
  ]
  await assert.rejects(f.push(records), { message: /LoTW did not acknowledge/ })
  assert.equal(f.transport.mock.callCount(), 2)
  // Core has no results from the failed chunk; a later explicit retry may
  // replay its accepted subbatch. The adapter never retries by itself.
  assert.deepEqual(
    await f.push(records),
    records.map(({ uuid }) => ({ uuid })),
  )
  assert.equal(f.transport.mock.callCount(), 5)
})

test('counts connection and upload time against the same elapsed budget', async () => {
  const f = fixture(8_000)
  f.transport.mock.mockImplementation(async (request) => {
    f.advance(request.timeout)
    return { status: 200, body: '<!-- .UPL. accepted -->' }
  })
  await assert.rejects(
    f.push([
      record('one'),
      record('two', { MY_GRIDSQUARE: 'FN32AA' }),
      record('three', { MY_GRIDSQUARE: 'FN33AA' }),
    ]),
    { message: 'Time ran out partway through this LoTW upload. Push again to send the rest.' },
  )
  assert.deepEqual(
    f.transport.mock.calls.map((call) => call.arguments[0].timeout),
    [30_000, 7_000],
  )
})

test('an upload that could not finish in time is not started', async () => {
  // Started with seconds left, it would time out after LoTW may have taken
  // it, and send the operator looking for an upload that maybe never left.
  const f = fixture(41_000)
  await assert.rejects(f.push([record('one')]), {
    message: 'Signing these contacts took too long, so nothing was sent to LoTW. Push again.',
  })
  assert.equal(f.transport.mock.callCount(), 0)
})

test('prevents concurrent pushes but releases the guard when an upload ends', async () => {
  const f = fixture()
  let resolveUpload: ((value: UploadReply) => void) | undefined
  f.transport.mock.mockImplementationOnce(
    () =>
      new Promise<UploadReply>((resolve) => {
        resolveUpload = resolve
      }),
  )
  const pending = f.push([record('one')])
  await waitFor(() => resolveUpload !== undefined)
  await assert.rejects(f.push([record('two')]), { message: /already running/ })
  if (!resolveUpload) throw new Error('The upload did not start')
  resolveUpload({ status: 200, body: '<!-- .UPL. accepted -->' })
  assert.deepEqual(await pending, [{ uuid: 'one' }])
  assert.deepEqual(await f.push([record('two')]), [{ uuid: 'two' }])
})

test('each certificate is a destination, and a push opens the one for its callsign', async () => {
  const f = fixture()
  const hook = createLotwTransferHook({
    connect: f.connect,
    stationCalls: () => ({ calls: ['N1RWJ', 'W1AW', 'K1ABC'] }),
  })
  // K1ABC has a certificate but no contacts here; only the log's calls are offered.
  assert.deepEqual(
    await hook.suggestDestinations(
      { service: 'lotw', scope: { kind: 'log' }, stationCalls: ['W1AW', 'N1RWJ'] },
      context,
    ),
    [
      { id: 'n1rwj', label: 'N1RWJ', stationCall: 'N1RWJ' },
      { id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' },
    ],
  )
  // A scope naming one call offers only its certificate.
  assert.deepEqual(
    await hook.suggestDestinations(
      {
        service: 'lotw',
        scope: { kind: 'chasing', stationCall: 'W1AW' },
        stationCalls: ['W1AW', 'N1RWJ'],
      },
      context,
    ),
    [{ id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }],
  )
  await hook.push(f.request([record('one')]), { ...context, online: true })
  assert.deepEqual(
    f.connect.mock.calls.map((call) => call.arguments.slice(1)),
    [['W1AW']],
  )
})

test('a certificate that would not open is reported only where no row is offered', async () => {
  const f = fixture()
  const hook = createLotwTransferHook({
    connect: f.connect,
    stationCalls: () => ({ calls: ['W1AW'], failure: new Error('the second certificate') }),
  })
  const suggest = (stationCalls: string[]) =>
    hook.suggestDestinations({ service: 'lotw', scope: { kind: 'log' }, stationCalls }, context)
  // Thrown in place of an empty list: the broken one may be N1RWJ's.
  await assert.rejects(suggest(['N1RWJ']), { message: 'the second certificate' })
  // Never in place of a working row, and not where no call asks for one.
  assert.deepEqual(await suggest(['W1AW', 'N1RWJ']), [
    { id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' },
  ])
  assert.deepEqual(await suggest([]), [])
  assert.deepEqual(await suggest(['W1AW/TEST']), [])
})

test('LoTW’s reason for refusing an upload reaches the operator', async () => {
  const f = fixture()
  f.transport.mock.mockImplementationOnce(async () => ({
    status: 200,
    body: '<!-- .UPL. rejected --><!-- .UPLMESSAGE. Duplicate file -->',
  }))
  await assert.rejects(f.push([record('one')]), {
    message:
      'LoTW refused the upload (“Duplicate file”). Check the certificate in the LoTW account settings and review the contacts before trying again.',
  })
})

test('no push is offered where uploads are unavailable', async () => {
  const f = fixture()
  const hook = createLotwTransferHook({ connect: f.connect, available: async () => false })
  assert.deepEqual(await hook.suggestPushes({ scope: { kind: 'log' } }, context), [])
  assert.equal(f.connect.mock.callCount(), 0)
})
