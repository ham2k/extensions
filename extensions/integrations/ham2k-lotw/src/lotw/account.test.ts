// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { HookContext } from '@ham2k/extension-sdk'
import {
  createLotwAccountHook,
  type LotwAccountPorts,
  loadLotwAccount,
  loadLotwAccountFor,
  maxLotwCertificateBytes,
  readLotwAccountCredentials,
} from './account.ts'
import type { LotwSigningPort } from './signing.ts'

const context: HookContext = { online: false }
const privateBytes = Uint8Array.of(0, 0x8b, 0xff)
const encodedCertificate = 'AIv/'
const credentials = {
  certificate: encodedCertificate,
  'certificate:name': 'my-private-backup.p12',
  certificatePassword: '  private password  ',
}
const invalid = 'Could not open the LoTW certificate. Check the file and its password.'

function fixture() {
  const signing = {
    certificate: {
      derBase64: 'AA==',
      serial: '1',
      callsign: 'W1AW',
      dxcc: 291,
      validFromMillis: 0,
      validToMillis: 100,
      qsoFrom: '2020-01-01',
    },
    signSha1: mock.fn<LotwSigningPort['signSha1']>(),
    gzip: mock.fn<LotwSigningPort['gzip']>(),
  } satisfies LotwSigningPort
  const ports = {
    base64ToBytes: mock.fn((_text: string): Uint8Array => privateBytes),
    loadCertificate: mock.fn(
      async (_p12: Uint8Array, _password: string, _ctx: HookContext): Promise<LotwSigningPort> =>
        signing,
    ),
  } satisfies LotwAccountPorts
  return { signing, ports, hook: createLotwAccountHook(ports) }
}

async function resolved<T>(value: T | ((args: Record<string, never>, ctx: HookContext) => T | Promise<T>)) {
  return typeof value === 'function'
    ? await (value as (args: Record<string, never>, ctx: HookContext) => T | Promise<T>)({}, context)
    : value
}

test('defines a bounded account file and password in the host secure credential dialog', async () => {
  const { hook } = fixture()
  assert.deepEqual(await resolved(hook.fields), [
    {
      key: 'certificate',
      label: 'LoTW certificate file (.p12)',
      type: 'file',
      accept: { extensions: ['p12'] },
      maxBytes: 65_536,
    },
    { key: 'certificatePassword', label: 'Certificate file password (if set)', type: 'secret' },
    ...[2, 3].flatMap((n) => [
      {
        key: `certificate${n}`,
        label: `Certificate ${n} (.p12)`,
        type: 'file',
        accept: { extensions: ['p12'] },
        maxBytes: 65_536,
      },
      {
        key: `certificate${n}Password`,
        label: `Certificate ${n} password (if set)`,
        type: 'secret',
      },
    ]),
  ])
  assert.equal(hook.synchronizable, false)
  assert.ok(!('oauth2' in hook))
})

test('a platform that refuses signing offers no field to store a certificate in', async () => {
  // Save stores what the fields hold without running Test: a field offered
  // there would put the key where the refusal says it must not go.
  const { ports } = fixture()
  const hook = createLotwAccountHook({
    ...ports,
    checkPlatform: async () => {
      throw new Error('Not here.')
    },
  })
  assert.deepEqual(await resolved(hook.fields), [])
  assert.equal(await resolved(hook.description), 'Not here.')
})

test('Account Test asks about every certificate at once', async () => {
  // Each lookup may wait out its own timeout, inside the host's ten seconds
  // for the whole Test: asked one after another, three would overrun it.
  const { signing, ports } = fixture()
  const calls = ['W1AW', 'K1ABC', 'N1RWJ']
  let opened = 0
  let inFlight = 0
  let most = 0
  const hook = createLotwAccountHook({
    ...ports,
    loadCertificate: async () => {
      const callsign = calls[opened++]
      return { ...signing, certificate: { ...signing.certificate, callsign, serial: callsign } }
    },
    checkCertificateStatus: async () => {
      most = Math.max(most, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return 'unrevoked'
    },
  })
  const all = {
    ...credentials,
    certificate2: encodedCertificate,
    certificate3: encodedCertificate,
  }
  assert.equal(
    await hook.testCredentials(all, context),
    'Certificates for W1AW, K1ABC, N1RWJ are ready.',
  )
  assert.equal(most, 3)
})

test('tests entered credentials and derives identity from the validated certificate', async () => {
  const f = fixture()
  const currentContext: HookContext = {
    online: false,
    account: { credentials: { certificate: 'old saved credential' } },
  }
  assert.equal(
    await f.hook.testCredentials(credentials, currentContext),
    'Certificate for W1AW is ready.',
  )
  assert.deepEqual(
    f.ports.base64ToBytes.mock.calls.map((call) => call.arguments),
    [[encodedCertificate]],
  )
  assert.deepEqual(
    f.ports.loadCertificate.mock.calls.map((call) => call.arguments),
    [[privateBytes, '  private password  ', currentContext]],
  )
  assert.equal(f.signing.signSha1.mock.callCount(), 0)
  assert.equal(f.signing.gzip.mock.callCount(), 0)
  assert.deepEqual(credentials, {
    certificate: encodedCertificate,
    'certificate:name': 'my-private-backup.p12',
    certificatePassword: '  private password  ',
  })
})

test('connection loading reopens the current credential and returns the provider capability', async () => {
  const f = fixture()
  assert.equal(await loadLotwAccount(credentials, context, f.ports), f.signing)
  assert.equal(
    await loadLotwAccount({ certificate: encodedCertificate }, context, f.ports),
    f.signing,
  )
  assert.deepEqual(f.ports.loadCertificate.mock.calls.at(-1)?.arguments, [
    privateBytes,
    '',
    context,
  ])
  assert.equal(f.ports.loadCertificate.mock.callCount(), 2)
})

test('a filename is optional display data and never supplies a certificate identity or password', async () => {
  const f = fixture()
  assert.equal(
    await f.hook.testCredentials(
      { certificate: encodedCertificate, 'certificate:name': 'N1RWJ.p12' },
      context,
    ),
    'Certificate for W1AW is ready.',
  )
  assert.equal(
    await f.hook.testCredentials(
      { certificate: encodedCertificate, password: 'unrelated' },
      context,
    ),
    'Certificate for W1AW is ready.',
  )
  assert.deepEqual(f.ports.loadCertificate.mock.calls.at(-1)?.arguments, [
    privateBytes,
    '',
    context,
  ])
})

const invalidCredentials: (Record<string, string> | undefined)[] = [
  undefined,
  {},
  { 'certificate:name': 'W1AW.p12' },
  { certificate: '' },
  { certificate: ' ' },
  { certificate: 'AA' },
  { certificate: 'AA===' },
  { certificate: 'AA==\n' },
  { certificate: 'AA=/' },
  { certificate: 'AB==' },
  { certificate: 'AAB=' },
]

for (const value of invalidCredentials) {
  test(`rejects missing, empty or noncanonical certificate bytes before decoding: ${JSON.stringify(value)}`, () => {
    const f = fixture()
    assert.throws(() => readLotwAccountCredentials(value, f.ports.base64ToBytes), {
      message: invalid,
    })
    assert.equal(f.ports.base64ToBytes.mock.callCount(), 0)
    assert.equal(f.ports.loadCertificate.mock.callCount(), 0)
  })
}

test('measures decoded length before allocating even at the maximum Base64 length', () => {
  const f = fixture()
  const sameEncodedLengthButTooManyBytes = 'AAAA'.repeat(Math.ceil(maxLotwCertificateBytes / 3))
  const evenLarger = 'AAAA'.repeat(Math.ceil(maxLotwCertificateBytes / 3) + 1)
  for (const certificate of [sameEncodedLengthButTooManyBytes, evenLarger]) {
    assert.throws(() => readLotwAccountCredentials({ certificate }, f.ports.base64ToBytes), {
      message: invalid,
    })
  }
  assert.equal(f.ports.base64ToBytes.mock.callCount(), 0)
})

test('accepts exactly 64KiB, including the canonical padding at the size boundary', () => {
  const f = fixture()
  const bytes = new Uint8Array(maxLotwCertificateBytes)
  const certificate = `${'AAAA'.repeat(Math.floor(maxLotwCertificateBytes / 3))}AA==`
  f.ports.base64ToBytes.mock.mockImplementation(() => bytes)
  assert.deepEqual(readLotwAccountCredentials({ certificate }, f.ports.base64ToBytes), {
    p12: bytes,
    password: '',
  })
  assert.deepEqual(
    f.ports.base64ToBytes.mock.calls.map((call) => call.arguments),
    [[certificate]],
  )
})

for (const bytes of [new Uint8Array(0), new Uint8Array(2), new Uint8Array(4)]) {
  test(`requires the decoder to return exactly the claimed number of bytes (${bytes.length})`, () => {
    const f = fixture()
    f.ports.base64ToBytes.mock.mockImplementation(() => bytes)
    assert.throws(() => readLotwAccountCredentials(credentials, f.ports.base64ToBytes), {
      message: invalid,
    })
    assert.equal(f.ports.loadCertificate.mock.callCount(), 0)
  })
}

test('decoder and parser/password failures expose neither private credentials nor filenames', async () => {
  const f = fixture()
  const secret = 'private password my-private-backup.p12 AIv/ private key bytes'
  f.ports.base64ToBytes.mock.mockImplementationOnce(() => {
    throw new Error(secret)
  })
  await assert.rejects(f.hook.testCredentials(credentials, context), { message: invalid })
  f.ports.loadCertificate.mock.mockImplementationOnce(async () => {
    throw new Error(secret)
  })
  await assert.rejects(f.hook.testCredentials(credentials, context), { message: invalid })
})

test('removed or cleared account credentials cannot reopen a previously valid certificate', async () => {
  const f = fixture()
  assert.equal(await loadLotwAccount(credentials, context, f.ports), f.signing)
  const clearedCredentials: (Record<string, string> | undefined)[] = [
    undefined,
    {},
    { certificate: '', 'certificate:name': 'W1AW.p12' },
  ]
  for (const cleared of clearedCredentials) {
    await assert.rejects(loadLotwAccount(cleared, context, f.ports), { message: invalid })
  }
  assert.equal(f.ports.loadCertificate.mock.callCount(), 1)
})

for (const callsign of [
  '',
  'my-private-backup.p12',
  'W1AW\nprivate password',
  'w1aw',
  'NO-CALL',
  '1234',
]) {
  test(`refuses an invalid certificate identity without falling back to the filename: ${callsign}`, async () => {
    const f = fixture()
    f.signing.certificate.callsign = callsign
    await assert.rejects(f.hook.testCredentials(credentials, context), { message: invalid })
  })
}

/** A port whose certificate's callsign is named by the file's text. */
function byCallsign(failing: string[] = []) {
  const f = fixture()
  const ports = {
    ...f.ports,
    base64ToBytes: (text: string) => new TextEncoder().encode(atob(text)),
    loadCertificate: mock.fn(async (p12: Uint8Array): Promise<LotwSigningPort> => {
      const callsign = new TextDecoder().decode(p12)
      if (failing.includes(callsign)) throw new Error(`parser detail for ${callsign}`)
      return { ...f.signing, certificate: { ...f.signing.certificate, callsign } }
    }),
  } satisfies LotwAccountPorts
  return { ports, hook: createLotwAccountHook(ports) }
}

test('Account Test opens every certificate and names each callsign', async () => {
  const { hook } = byCallsign()
  assert.equal(
    await hook.testCredentials({ certificate: btoa('W1AW'), certificate3: btoa('N1RWJ') }, context),
    'Certificates for W1AW, N1RWJ are ready.',
  )
  await assert.rejects(
    hook.testCredentials({ certificate: btoa('W1AW'), certificate2: btoa('W1AW') }, context),
    { message: 'Two of the LoTW certificates are for W1AW. Keep only the latest one.' },
  )
  // A certificate that fails names its slot and nothing it read.
  await assert.rejects(
    byCallsign(['N1RWJ']).hook.testCredentials(
      { certificate: btoa('W1AW'), certificate2: btoa('N1RWJ') },
      context,
    ),
    { message: 'Could not open the second LoTW certificate. Check the file and its password.' },
  )
})

test('an upload opens the certificate for its callsign, past one that fails', async () => {
  const { ports } = byCallsign(['K1ABC'])
  const credentials = {
    certificate: btoa('K1ABC'),
    certificate2: btoa('W1AW'),
    certificate3: btoa('N1RWJ'),
  }
  const signing = await loadLotwAccountFor(credentials, context, ports, 'N1RWJ')
  assert.equal(signing.certificate.callsign, 'N1RWJ')
  // It stops at the match: a third certificate is not opened for the second's call.
  ports.loadCertificate.mock.resetCalls()
  await loadLotwAccountFor(credentials, context, ports, 'W1AW')
  assert.equal(ports.loadCertificate.mock.callCount(), 2)
  // With no match, the failure is what the operator sees, not a callsign search.
  await assert.rejects(loadLotwAccountFor(credentials, context, ports, 'KA1XYZ'), {
    message: invalid,
  })
  await assert.rejects(loadLotwAccountFor({ certificate: btoa('W1AW') }, context, ports, 'N1RWJ'), {
    message: 'None of the LoTW certificates is for N1RWJ.',
  })
})
