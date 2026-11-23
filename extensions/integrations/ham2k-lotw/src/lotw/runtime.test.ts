// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { verify, X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { isNativeError } from 'node:util/types'
import { createContext, runInContext } from 'node:vm'
import { gunzipSync } from 'node:zlib'
import type {
  AccountHook,
  ExtensionDefinition,
  HookContext,
  PushRequest,
  PushScope,
  TransferHook,
} from '@ham2k/extension-sdk'
import manifest from '../../manifest.json' with { type: 'json' }
import vector from '../fixtures/vector.json' with { type: 'json' }

const fixtures = new URL('../fixtures/', import.meta.url)
const now = Date.parse('2027-01-01T00:00:00Z')
const password = 'ferry-fixture'

const scope: PushScope = { kind: 'chasing', stationCall: 'W1AW' }
const destination = { id: 'w1aw', label: 'W1AW', stationCall: 'W1AW' }
const request: PushRequest = {
  service: 'lotw',
  stationCall: 'W1AW',
  destination,
  records: [
    {
      uuid: 'chasing-contact',
      adif: [
        '<CALL:5>K1ABC<QSO_DATE:8>20261022<TIME_ON:6>123456<BAND:3>20m<MODE:3>FT8' +
          '<FREQ:6>14.074<STATION_CALLSIGN:4>W1AW<MY_DXCC:3>291<MY_GRIDSQUARE:6>FN31pr' +
          '<QTH:10>São Tomé <MY_STATE:2>CT<MY_CNTY:10>CT,Tolland<MY_CQ_ZONE:1>5<MY_ITU_ZONE:1>8<EOR>',
      ],
    },
  ],
}

// Built by build.mjs itself, on load, rather than read from a build/ left by
// an earlier run: the gate runs this before anything else builds, and a stale
// bundle would pass these tests for code that has since changed. Forge signs
// inside the sandbox only through the settings build.mjs applies, so the
// source alone cannot stand in for the bundle.
const bundle = import(new URL('../../build.mjs', import.meta.url).href).then(() =>
  readFile(new URL('../../build/index.js', import.meta.url), 'utf8'),
)

const sandboxModules = Promise.all(
  Object.keys(manifest.sharedDependencies).map(async (name) => {
    const loaded = await import(name)
    return [name, name === 'i18next' ? loaded.default : loaded] as const
  }),
).then(Object.fromEntries)

// Values made inside the sandbox carry its realm's prototypes, which strict
// equality compares; a structured clone rebuilds them in this realm so the
// comparison sees only their data.
const local = <T>(value: T): T => structuredClone(value)

/** The fields the account offers here; they depend on the platform. */
async function fieldsOf(account: AccountHook, ctx: HookContext) {
  const fields = account.fields
  return local(typeof fields === 'function' ? await fields({}, ctx) : (fields ?? []))
}

type Scenario = {
  status?: string
  statusUnavailable?: boolean
  randomUnavailable?: boolean
  expired?: boolean
  platform?: string
  // Extra account values, beside the first certificate and its password.
  credentials?: Record<string, string>
}

async function activate(kind: 'current' | 'legacy', scenario: Scenario = {}) {
  const [source, sharedModules, p12, certPem] = await Promise.all([
    bundle,
    sandboxModules,
    readFile(new URL(`synthetic-${kind}.p12`, fixtures)),
    readFile(new URL('certificate.pem', fixtures)),
  ])
  const certificate = new X509Certificate(certPem)
  const serial = BigInt(`0x${certificate.serialNumber}`).toString()
  const clock = scenario.expired ? Date.parse(certificate.validTo) + 1 : now
  const credentials: Record<string, string> = {
    certificate: p12.toString('base64'),
    certificatePassword: password,
    ...scenario.credentials,
  }
  const ctx: HookContext = { online: true, account: { credentials } }
  const calls: { method: string; params: Record<string, unknown> }[] = []
  let definition: ExtensionDefinition | undefined
  let account: AccountHook | undefined
  let transfer: TransferHook | undefined

  const sandbox = createContext({
    performance: { now: () => performance.now() },
    __halo: {
      sharedModules,
      defineExtension(value: ExtensionDefinition) {
        definition = value
      },
    },
  })
  runInContext(
    `globalThis.Date = class extends Date {
      constructor(...args) { super(...(args.length ? args : [${clock}])) }
      static now() { return ${clock} }
    };
    Math.random = () => { throw new Error('Ambient entropy is forbidden') };`,
    sandbox,
  )
  assert.deepEqual(
    local(
      runInContext(
        '[typeof process, typeof require, typeof Buffer, typeof fetch, typeof crypto, typeof window, typeof document]',
        sandbox,
      ),
    ),
    Array.from({ length: 7 }, () => 'undefined'),
  )
  runInContext(source, sandbox, { filename: 'ham2k-lotw.js', timeout: 5000 })
  definition?.onActivation({
    registerHook(category, { hook }) {
      if (category === 'account') account = hook as AccountHook
      if (category === 'transfer') transfer = hook as TransferHook
    },
    async hostCall(method, params) {
      // Answered apart from `calls`, which the tests read as what reached
      // the network or the entropy source.
      if (method === 'getVersionInfo') return { platform: scenario.platform ?? 'macos' }
      calls.push({ method, params })
      if (method === 'randomBytes') {
        if (scenario.randomUnavailable) throw new Error('No secure source')
        const { length } = params
        if (typeof length !== 'number' || length < 1 || length > 4096)
          throw new Error('Invalid entropy request')
        // These bytes deliberately make the offline fixture reproducible.
        return Buffer.alloc(length, 7).toString('base64')
      }
      if (
        method === 'fetchStrict' &&
        params.url === `https://lotw.arrl.org/lotw/crl?serial=${serial}`
      ) {
        assert.equal(params.redirect, 'error')
        assert.equal(params.method ?? 'GET', 'GET')
        assert.equal(params.bodyBase64, undefined)
        if (scenario.statusUnavailable) throw new Error('Certificate status unavailable')
        return {
          status: 200,
          body: `<LoTW_CRL><Serial>${serial}</Serial><Status>${scenario.status ?? 'Unrevoked'}</Status></LoTW_CRL>`,
        }
      }
      if (method === 'fetchStrict' && params.url === 'https://lotw.arrl.org/lotw/upload') {
        assert.equal(params.redirect, 'error')
        assert.equal(params.method, 'POST')
        return { status: 200, body: '<!-- .UPL. accepted -->' }
      }
      throw new Error(`Unexpected host method ${method}`)
    },
  })

  if (!account || !transfer?.push)
    throw new Error('The bundle did not activate LoTW account and push hooks')
  const push = transfer.push.bind(transfer)
  const posts = () => calls.filter(({ params }) => params.method === 'POST')
  const statusChecks = () =>
    calls.filter(({ params }) => params.url === `https://lotw.arrl.org/lotw/crl?serial=${serial}`)
  return { account, transfer, push, ctx, credentials, calls, certificate, posts, statusChecks }
}

function unpackUpload(params: Record<string, unknown>): string {
  const { bodyBase64, headers } = params
  if (typeof bodyBase64 !== 'string' || !headers || typeof headers !== 'object')
    throw new Error('Expected a binary multipart body')
  assert.equal(params.body, undefined)
  const contentType = (headers as Record<string, string>)['Content-Type']
  const boundary = /^multipart\/form-data; boundary=(\S+)$/.exec(contentType)?.[1]
  if (!boundary) throw new Error('Missing multipart boundary')
  const body = Buffer.from(bodyBase64, 'base64')
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="upfile"; filename="ham2k-log.tq8"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n',
    'ascii',
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'ascii')
  assert.deepEqual(body.subarray(0, header.length), header)
  assert.deepEqual(body.subarray(-footer.length), footer)
  return gunzipSync(body.subarray(header.length, -footer.length)).toString('ascii')
}

for (const kind of ['current', 'legacy'] as const) {
  test(`the built extension imports a ${kind} certificate, signs, and records a binary upload receipt`, async () => {
    const f = await activate(kind)
    assert.equal(manifest.api, 29)
    assert.ok(manifest.hooks.includes('account'))
    assert.ok(manifest.domains.includes('lotw.arrl.org'))
    const fields = await fieldsOf(f.account, f.ctx)
    assert.ok(
      fields.some(
        (field) =>
          field.type === 'file' &&
          field.key === 'certificate' &&
          field.label === 'LoTW certificate file (.p12)',
      ),
    )
    assert.equal(f.account.synchronizable, false)
    assert.equal(
      await f.account.testCredentials(f.credentials, f.ctx),
      'Certificate for W1AW is ready.',
    )
    assert.equal(f.statusChecks().length, 1)
    assert.equal(f.posts().length, 0)
    const beforeSuggestions = f.calls.length
    assert.deepEqual(
      local(
        await f.transfer.suggestDestinations(
          { service: 'lotw', scope, stationCalls: ['W1AW'] },
          f.ctx,
        ),
      ),
      [destination],
    )
    assert.equal(f.calls.length, beforeSuggestions)
    assert.deepEqual(local(await f.push(request, f.ctx)), [{ uuid: 'chasing-contact' }])
    assert.ok(f.calls.some(({ method }) => method === 'randomBytes'))
    assert.equal(f.statusChecks().length, 1)
    const posts = f.posts()
    assert.equal(posts.length, 1)
    assert.ok(!JSON.stringify(f.calls).includes(f.credentials.certificate))
    assert.ok(!JSON.stringify(f.calls).includes(password))
    const text = unpackUpload(posts[0].params)
    assert.ok(!text.includes(f.credentials.certificate))
    assert.ok(!text.includes(password))
    const certBase64 = f.certificate.raw.toString('base64')
    assert.ok(text.includes(`<CERTIFICATE:${certBase64.length}>${certBase64}\n`))
    const signature = /<SIGN_LOTW_V2\.0:\d+:6>([A-Za-z0-9+/=]+)\n/.exec(text)?.[1]
    assert.equal(signature, vector.signatureBase64)
    assert.ok(text.includes(`<SIGNDATA:${vector.canonical.length}>${vector.canonical}\n`))
    assert.equal(
      verify(
        'RSA-SHA1',
        Buffer.from(vector.canonical, 'ascii'),
        f.certificate.publicKey,
        Buffer.from(signature ?? '', 'base64'),
      ),
      true,
    )
  })
}

test('the built extension stops before sending when the host cannot supply secure entropy', async () => {
  const f = await activate('current', { randomUnavailable: true })
  await assert.rejects(f.push(request, f.ctx))
  assert.ok(f.calls.some(({ method }) => method === 'randomBytes'))
  assert.equal(f.posts().length, 0)
})

// Each says why, so the operator knows whether to retry, reconnect or wait.
for (const [reason, scenario, why] of [
  ['an unknown reply', { status: 'Not found' }, 'LoTW’s answer was not a certificate status'],
  ['a connection failure', { statusUnavailable: true }, 'LoTW did not answer'],
] as const) {
  test(`Account Test reports ${reason} without blocking a later upload`, async () => {
    const f = await activate('current', scenario)
    assert.equal(
      await f.account.testCredentials(f.credentials, f.ctx),
      `Certificate file for W1AW opened. LoTW certificate status could not be checked: ${why}.`,
    )
    assert.equal(f.posts().length, 0)
    assert.equal(f.statusChecks().length, 1)
    assert.deepEqual(local(await f.push(request, f.ctx)), [{ uuid: 'chasing-contact' }])
    assert.equal(f.statusChecks().length, 1)
    assert.equal(f.posts().length, 1)
  })
}

test('Account Test can open the file while offline', async () => {
  const f = await activate('current')
  assert.equal(
    await f.account.testCredentials(f.credentials, { ...f.ctx, online: false }),
    'Certificate file for W1AW opened. LoTW certificate status could not be checked: this device is offline.',
  )
  assert.equal(f.calls.length, 0)
})

for (const [status, message] of [
  ['Revoked', /LoTW reports the certificate for W1AW was revoked\./],
  ['Superceded', /LoTW reports the certificate for W1AW was replaced\./],
] as const) {
  test(`Account Test reports that LoTW returned ${status}`, async () => {
    const f = await activate('current', { status })
    await assert.rejects(f.account.testCredentials(f.credentials, f.ctx), { message })
    assert.equal(f.statusChecks().length, 1)
    assert.equal(f.posts().length, 0)
  })
}

test('a valid saved certificate can upload without running Account Test', async () => {
  const f = await activate('current', { statusUnavailable: true })
  assert.deepEqual(local(await f.push(request, f.ctx)), [{ uuid: 'chasing-contact' }])
  assert.equal(f.statusChecks().length, 0)
  assert.equal(f.posts().length, 1)
})

test('an expired certificate stops a push before any network request', async () => {
  const f = await activate('current', { expired: true })
  // Named and dated: with three certificates, "a certificate expired" leaves
  // the operator guessing which one to renew.
  await assert.rejects(f.push(request, f.ctx), {
    message:
      'The LoTW certificate for W1AW expired on 2030-10-21. Renew it in TQSL, then choose the new .p12 file.',
  })
  assert.equal(f.calls.length, 0)
})

test('a wrong certificate password produces no upload or leaked password', async () => {
  const f = await activate('legacy')
  const certificatePassword = 'private wrong password 😀'
  const withoutPassword = (error: unknown) => {
    assert.ok(isNativeError(error))
    assert.ok(!error.message.includes(certificatePassword))
    return true
  }
  await assert.rejects(
    f.account.testCredentials({ ...f.credentials, certificatePassword }, f.ctx),
    withoutPassword,
  )
  await assert.rejects(
    f.account.testCredentials({ ...f.credentials, certificatePassword }, f.ctx),
    {
      message:
        'The password does not open the LoTW certificate. Enter the one you set when you saved it from TQSL.',
    },
  )
  await assert.rejects(
    f.push(request, {
      ...f.ctx,
      account: { credentials: { ...f.credentials, certificatePassword } },
    }),
    withoutPassword,
  )
  assert.equal(f.calls.length, 0)
})

test('the web build offers no push and refuses Account Test before opening a certificate', async () => {
  // The web keeps credentials and the key that unlocks them in browser
  // storage; a signing key must not be put to use there.
  const f = await activate('current', { platform: 'web' })
  assert.ok(f.transfer.suggestPushes)
  assert.deepEqual(local(await f.transfer.suggestPushes({ scope }, f.ctx)), [])
  // Save runs no Test: with no field to choose a file in, it stores none.
  assert.deepEqual(await fieldsOf(f.account, f.ctx), [])
  await assert.rejects(f.account.testCredentials(f.credentials, f.ctx), {
    message: /need the desktop or mobile app/,
  })
  assert.equal(f.calls.length, 0)
})

test('two certificates for one callsign fail Account Test and offer no upload', async () => {
  // Save runs no Test, so Exports must refuse too: an upload would sign with
  // whichever comes first, which may be the one LoTW replaced.
  const legacy = await readFile(new URL('synthetic-legacy.p12', fixtures))
  const f = await activate('current', {
    credentials: { certificate2: legacy.toString('base64'), certificate2Password: password },
  })
  const message = 'Two of the LoTW certificates are for W1AW. Keep only the latest one.'
  await assert.rejects(f.account.testCredentials(f.credentials, f.ctx), { message })
  await assert.rejects(
    f.transfer.suggestDestinations({ service: 'lotw', scope, stationCalls: ['W1AW'] }, f.ctx),
    { message },
  )
})

test('a certificate that will not open does not stop another callsign uploading', async () => {
  const legacy = await readFile(new URL('synthetic-legacy.p12', fixtures))
  const cases: Record<string, string>[] = [
    { certificate2: legacy.toString('base64'), certificate2Password: 'wrong' },
    // The broken one first: the search must go on past it.
    {
      certificatePassword: 'wrong',
      certificate2: legacy.toString('base64'),
      certificate2Password: password,
    },
  ]
  for (const credentials of cases) {
    const f = await activate('current', { credentials })
    assert.deepEqual(
      local(
        await f.transfer.suggestDestinations(
          { service: 'lotw', scope, stationCalls: ['W1AW'] },
          f.ctx,
        ),
      ),
      [destination],
    )
    assert.deepEqual(local(await f.push(request, f.ctx)), [{ uuid: 'chasing-contact' }])
    assert.equal(f.posts().length, 1)
    // Account Test still names the one that failed, so the operator fixes it.
    await assert.rejects(f.account.testCredentials(f.credentials, f.ctx), {
      message: /^The password does not open the (second )?LoTW certificate\./,
    })
  }
})

test('a certificate that will not open says why where its callsign would be offered', async () => {
  // Without the reason, the LoTW row for a broken certificate's callsign
  // simply is not there, and nothing says what to fix.
  const notACertificate = Buffer.from('not a certificate file').toString('base64')
  const f = await activate('current', {
    credentials: { certificate2: notACertificate, certificate2Password: '' },
  })
  const suggest = (stationCalls: string[]) =>
    f.transfer.suggestDestinations(
      { service: 'lotw', scope: { kind: 'log' }, stationCalls },
      f.ctx,
    )
  await assert.rejects(suggest(['K1ABC']), {
    message:
      'The second LoTW certificate file is not a TQSL callsign certificate. Choose the .p12 file you saved from TQSL.',
  })
  // A callsign whose certificate opens still gets its row.
  assert.deepEqual(local(await suggest(['K1ABC', 'W1AW'])), [destination])
  assert.deepEqual(local(await suggest([])), [])
})
