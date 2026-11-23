// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { verify, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import vector from '../fixtures/vector.json' with { type: 'json' }
import { buildSignedTq8, type LotwSigningPort } from './signing.ts'
import {
  LotwNotSentError,
  type LotwUploadRequest,
  parseLotwUploadResponse,
  uploadLotwTq8,
} from './upload.ts'

// Public synthetic certificate and independently generated signature from
// Ferry's fixtures/signing. They carry no ARRL authority.
const certificate = new X509Certificate(
  readFileSync(new URL('../fixtures/certificate.pem', import.meta.url)),
)
const nowMillis = Date.parse('2027-01-01T00:00:00Z')

function makePort() {
  return {
    certificate: {
      derBase64: certificate.raw.toString('base64'),
      serial: BigInt(`0x${certificate.serialNumber}`).toString(),
      callsign: 'W1AW',
      dxcc: 291,
      validFromMillis: Date.parse(certificate.validFrom),
      validToMillis: Date.parse(certificate.validTo),
      qsoFrom: '2025-01-01',
    },
    signSha1: mock.fn(async (canonical: string) => {
      assert.equal(canonical, vector.canonical)
      return vector.signatureBase64
    }),
    gzip: async (ascii: string): Promise<Uint8Array> => gzipSync(ascii),
  } satisfies LotwSigningPort
}

test('serializes the Ferry canonical bytes and a signature that verifies independently', async () => {
  const port = makePort()
  const bytes = await buildSignedTq8(port, vector.station, [vector.contact], nowMillis)
  const text = gunzipSync(bytes).toString('ascii')
  assert.ok(
    text.includes(
      `<CERTIFICATE:${port.certificate.derBase64.length}>${port.certificate.derBase64}`,
    ),
  )
  assert.ok(text.includes('<GRIDSQUARE:6>FN31PR\n'))
  assert.ok(text.includes('<REC_TYPE:8>tCONTACT\n'))
  assert.ok(text.includes(`<SIGNDATA:${vector.canonical.length}>${vector.canonical}\n`))
  assert.ok(
    text.includes(`<SIGN_LOTW_V2.0:${vector.signatureBase64.length}:6>${vector.signatureBase64}\n`),
  )
  assert.equal(
    verify(
      'RSA-SHA1',
      Buffer.from(vector.canonical, 'ascii'),
      certificate.publicKey,
      Buffer.from(vector.signatureBase64, 'base64'),
    ),
    true,
  )
})

test('preserves eight-character grids and rejects unsupported batch members before signing', async () => {
  const port = makePort()
  const station = { ...vector.station, grid: 'FN31pr12' }
  port.signSha1 = mock.fn(async (canonical: string) => {
    assert.equal(canonical, vector.canonical.replace('FN31PR', 'FN31PR12'))
    return vector.signatureBase64
  })
  const bytes = await buildSignedTq8(port, station, [vector.contact], nowMillis)
  assert.ok(gunzipSync(bytes).toString('ascii').includes('<GRIDSQUARE:8>FN31PR12\n'))

  const invalidPort = makePort()
  await assert.rejects(
    buildSignedTq8(
      invalidPort,
      station,
      [vector.contact, { ...vector.contact, id: 'invalid-mode', mode: 'FST4W' }],
      nowMillis,
    ),
    { message: 'LoTW does not take the mode FST4W.' },
  )
  assert.equal(invalidPort.signSha1.mock.callCount(), 0)
})

test('refuses a mismatched or expired certificate and a QSO outside its date window', async () => {
  const port = makePort()
  const contacts = [vector.contact]
  await assert.rejects(buildSignedTq8(port, { ...vector.station, dxcc: 1 }, contacts, nowMillis), {
    message: /must match the certificate/,
  })
  await assert.rejects(
    buildSignedTq8(port, vector.station, contacts, port.certificate.validToMillis + 1),
    { message: /outside its validity period/ },
  )
  port.certificate.qsoFrom = '2026-10-23'
  await assert.rejects(buildSignedTq8(port, vector.station, contacts, nowMillis), {
    message: /outside the dates the certificate for W1AW covers \(from 2026-10-23\)/,
  })
  assert.equal(port.signSha1.mock.callCount(), 0)
})

test('sends unchanged gzip bytes as one multipart upfile and accepts a queue acknowledgement', async () => {
  const tq8 = gzipSync('sample synthetic QSO')
  const transport = mock.fn(async (request: LotwUploadRequest) => {
    assert.equal(request.url, 'https://lotw.arrl.org/lotw/upload')
    assert.equal(request.method, 'POST')
    assert.equal(request.redirect, 'error')
    const boundary = request.headers['Content-Type'].split('boundary=')[1]
    const body = Buffer.from(request.body)
    const part = body.indexOf('\r\n\r\n')
    assert.equal(
      body.subarray(0, part).toString('ascii'),
      `--${boundary}\r\nContent-Disposition: form-data; name="upfile"; filename="ham2k-log.tq8"\r\nContent-Type: application/octet-stream`,
    )
    assert.deepEqual(body.subarray(part + 4, part + 4 + tq8.length), tq8)
    assert.equal(body.subarray(part + 4 + tq8.length).toString('ascii'), `\r\n--${boundary}--\r\n`)
    return { status: 200, body: '<!-- .UPL. accepted -->' }
  })
  assert.deepEqual(await uploadLotwTq8(tq8, transport), { state: 'queued' })
  assert.equal(transport.mock.callCount(), 1)
})

test('distinguishes rejection from indeterminate upload responses and avoids transport retries', async () => {
  const accepted = '<!-- .UPL. accepted -->'
  const rejected = '<!-- .UPL. rejected -->'
  assert.deepEqual(parseLotwUploadResponse(200, rejected), { state: 'rejected' })
  assert.deepEqual(parseLotwUploadResponse(200, accepted + rejected), {
    state: 'unknown',
    reason: 'response',
  })
  assert.deepEqual(parseLotwUploadResponse(200, 'server maintenance'), {
    state: 'unknown',
    reason: 'response',
  })
  assert.deepEqual(parseLotwUploadResponse(503, accepted), { state: 'unknown', reason: 'http' })
  const transport = mock.fn(
    async (_request: LotwUploadRequest): Promise<{ status: number; body: string }> => {
      throw new Error('timeout')
    },
  )
  assert.deepEqual(await uploadLotwTq8(gzipSync('sample synthetic QSO'), transport), {
    state: 'unknown',
    reason: 'transport',
  })
  assert.equal(transport.mock.callCount(), 1)
})

test('a rejection carries LoTW’s own reason, as plain text of bounded length', async () => {
  const rejected = '<!-- .UPL. rejected -->'
  assert.deepEqual(
    parseLotwUploadResponse(
      200,
      `${rejected}<!-- .UPLMESSAGE. <b>Certificate</b>\n  is   expired\u0007 -->`,
    ),
    { state: 'rejected', message: 'Certificate is expired' },
  )
  const long = parseLotwUploadResponse(200, `${rejected}<!-- .UPLMESSAGE. ${'x'.repeat(500)} -->`)
  assert.equal(long.state === 'rejected' && long.message?.length, 200)
  // Two messages, or one with nothing left once cleaned, give no reason
  // rather than a guessed one.
  for (const body of [
    `${rejected}<!-- .UPLMESSAGE. one --><!-- .UPLMESSAGE. two -->`,
    `${rejected}<!-- .UPLMESSAGE. <br> -->`,
  ]) {
    assert.deepEqual(parseLotwUploadResponse(200, body), { state: 'rejected' })
  }
})

test('a transport refusal from before sending is not reported as a possible delivery', async () => {
  // Read as `unknown`, it would send the operator to LoTW's activity page
  // looking for an upload that never left.
  const notSent = new LotwNotSentError('nothing was sent')
  const transport = mock.fn(async (_request: LotwUploadRequest) => {
    throw notSent
  })
  await assert.rejects(uploadLotwTq8(gzipSync('sample synthetic QSO'), transport), notSent)
})
