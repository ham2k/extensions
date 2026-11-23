// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { checkLotwCertificateStatus } from './certificate-status.ts'
import type { LotwHostPorts } from './host.ts'

const serial = '12345678901234567890'
const reply = (status: string, echoedSerial = serial) =>
  `<LoTW_CRL>\n  <Serial>${echoedSerial}</Serial>\n  <Status>${status}</Status>\n</LoTW_CRL>\n`

function fakeFetch(body: string, status = 200) {
  return mock.fn<LotwHostPorts['fetch']>(async () => ({ status, body }))
}

describe('LoTW certificate status', () => {
  it('fetches only the decimal certificate serial and accepts a matching unrevoked reply', async () => {
    const fetch = fakeFetch(reply('Unrevoked'))
    assert.equal(await checkLotwCertificateStatus(serial, fetch), 'unrevoked')
    assert.deepEqual(
      fetch.mock.calls.map((call) => call.arguments),
      [
        [
          `https://lotw.arrl.org/lotw/crl?serial=${serial}`,
          {
            method: 'GET',
            redirect: 'error',
            headers: { 'Cache-Control': 'no-cache' },
            timeout: 5_000,
          },
        ],
      ],
    )
  })

  for (const [status, expected] of [
    ['Revoked', 'revoked'],
    ['Superceded', 'superseded'],
    ['Superseded', 'superseded'],
  ]) {
    it(`handles LoTW status ${status}`, async () => {
      const fetch = fakeFetch(reply(status))
      assert.equal(await checkLotwCertificateStatus(serial, fetch), expected)
    })
  }

  for (const invalid of ['', '0', '01', '-1', '7&serial=8', '0x12', '9'.repeat(51)]) {
    it(`does not send invalid serial ${invalid}`, async () => {
      const fetch = fakeFetch(reply('Unrevoked'))
      assert.equal(await checkLotwCertificateStatus(invalid, fetch), 'unknown')
      assert.equal(fetch.mock.callCount(), 0)
    })
  }

  for (const [description, body] of [
    ['different serial', reply('Unrevoked', '9')],
    ['unknown status', reply('Bad serial')],
    ['HTML wrapper', `<html>${reply('Unrevoked')}</html>`],
    ['duplicate reply', reply('Unrevoked') + reply('Revoked')],
    ['duplicate status', reply('Unrevoked</Status><Status>Revoked')],
    ['oversized reply', reply('Unrevoked') + ' '.repeat(16_384)],
    ['missing serial', '<LoTW_CRL><Status>Unrevoked</Status></LoTW_CRL>'],
  ]) {
    it(`does not trust a ${description}`, async () => {
      assert.equal(await checkLotwCertificateStatus(serial, fakeFetch(body)), 'unknown')
    })
  }

  for (const status of [206, 302, 401, 500]) {
    it(`does not trust a ${status} response`, async () => {
      const fetch = fakeFetch(reply('Unrevoked'), status)
      assert.equal(await checkLotwCertificateStatus(serial, fetch), 'unknown')
    })
  }

  it('returns unknown after a refused or unavailable request', async () => {
    const fetch = mock.fn<LotwHostPorts['fetch']>(async () => {
      throw new Error(serial)
    })
    assert.equal(await checkLotwCertificateStatus(serial, fetch), 'unknown')
    assert.equal(fetch.mock.callCount(), 1)
  })
})
