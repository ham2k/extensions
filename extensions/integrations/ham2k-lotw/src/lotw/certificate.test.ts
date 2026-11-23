// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it, mock } from 'node:test'
import forge from 'node-forge'
import vector from '../fixtures/vector.json' with { type: 'json' }
import { LotwCertificateFileProblem } from './account.ts'
import { openLotwCertificate } from './certificate.ts'

const fixturePassword = 'ferry-fixture'
const fixture = (format: string) =>
  Uint8Array.from(readFileSync(new URL(`../fixtures/synthetic-${format}.p12`, import.meta.url)))

describe('TrustedQSL certificate backups', () => {
  for (const format of ['legacy', 'current']) {
    it(`matches the OpenSSL signature for a ${format} backup`, async () => {
      const opened = openLotwCertificate(fixture(format), fixturePassword)
      const randomBytes = mock.fn(async (size: number) =>
        Uint8Array.from({ length: size }, (_, index) => index % 256),
      )
      const originalRandom = forge.random.getBytes
      const certificate = new X509Certificate(
        readFileSync(new URL('../fixtures/certificate.pem', import.meta.url)),
      )
      assert.partialDeepStrictEqual(opened.certificate, {
        serial: BigInt(`0x${certificate.serialNumber}`).toString(),
        callsign: 'W1AW',
        dxcc: 291,
        derBase64: certificate.raw.toString('base64'),
      })
      assert.equal(await opened.signSha1(vector.canonical, randomBytes), vector.signatureBase64)
      assert.deepEqual(
        randomBytes.mock.calls.map((call) => call.arguments),
        [[1024]],
      )
      assert.equal(forge.random.getBytes, originalRandom)
    })
  }

  it('cannot sign with missing or short host entropy', async () => {
    const opened = openLotwCertificate(fixture('current'), fixturePassword)
    await assert.rejects(
      opened.signSha1(vector.canonical, async () => new Uint8Array(31)),
      {
        message: /Secure randomness is unavailable/,
      },
    )
    await assert.rejects(
      opened.signSha1(vector.canonical, async () => {
        throw new Error('Host randomness refused')
      }),
      { message: /Host randomness refused/ },
    )
  })

  it('rejects the wrong password, excessive size, and data after the P12', () => {
    const original = fixture('current')
    assert.throws(() => openLotwCertificate(original, 'wrong password'))
    assert.throws(() => openLotwCertificate(new Uint8Array(65_537), fixturePassword), {
      message: /size limit/,
    })
    const padded = new Uint8Array(original.length + 1)
    padded.set(original)
    assert.throws(() => openLotwCertificate(padded, fixturePassword))
  })

  it('bounds the MAC work before entering the password derivation', () => {
    const root = forge.asn1.fromDer(Buffer.from(fixture('current')).toString('binary'))
    if (typeof root.value === 'string') throw new Error('Invalid test fixture')
    const mac = root.value[2]
    if (typeof mac.value === 'string') throw new Error('Invalid test fixture')
    mac.value[2] = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.INTEGER,
      false,
      '\x01\x86\xa1', // 100,001 rounds
    )
    const input = Uint8Array.from(Buffer.from(forge.asn1.toDer(root).getBytes(), 'binary'))
    assert.throws(() => openLotwCertificate(input, fixturePassword), {
      message: /derivation exceeds the work limit/,
    })
  })
})

// Each kind picks the operator's message: a wrong password, a file saved
// without its key, and a file that is not a TQSL certificate need different fixes.
describe('a certificate file that will not open', () => {
  const problem = (kind: string) => (error: unknown) =>
    error instanceof LotwCertificateFileProblem && error.kind === kind

  it('names a wrong password', () => {
    for (const format of ['legacy', 'current']) {
      assert.throws(() => openLotwCertificate(fixture(format), 'wrong'), problem('password'))
    }
  })

  it('names a file with no private key', () => {
    const cert = forge.pki.certificateFromPem(
      readFileSync(new URL('../fixtures/certificate.pem', import.meta.url), 'utf8'),
    )
    const p12 = forge.asn1
      .toDer(forge.pkcs12.toPkcs12Asn1(null, cert, fixturePassword, { algorithm: '3des' }))
      .getBytes()
    assert.throws(
      () => openLotwCertificate(Uint8Array.from(p12, (c) => c.charCodeAt(0)), fixturePassword),
      problem('noKey'),
    )
  })

  it('names a file that is not a certificate at all', () => {
    const text = new TextEncoder().encode('not a certificate file')
    assert.throws(() => openLotwCertificate(text, ''), problem('notLotw'))
  })
})
