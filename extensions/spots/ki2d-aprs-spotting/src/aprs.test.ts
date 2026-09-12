// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The packet, byte for byte. APRS is a wire format read by radios, igates
// and the QSO party trackers, none of which say why a beacon did not place a
// station — so each piece is held to the string the spec and app-polo write.

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  aprsComment,
  aprsLogin,
  aprsPacket,
  aprsPasscode,
  aprsPosition,
  aprsSource,
  base64,
  COMMENT_MAX_LENGTH,
  positionOf,
} from "./aprs.ts"

test("the passcode is the standard hash of the base call, SSID ignored", () => {
  // Values every APRS client agrees on; a wrong hash is a login the server
  // answers with `unverified`, and a beacon it silently drops.
  assert.equal(aprsPasscode('KI2D'), 2799)
  assert.equal(aprsPasscode('ki2d-1'), 2799)
  assert.equal(aprsPasscode('N0CALL'), 13023)
  // An odd-length call has no partner for its last character; app-polo XORs
  // NaN there, which is a no-op, and so is this.
  assert.equal(aprsPasscode('W1AW'), aprsPasscode('W1AW-9'))
  assert.equal(aprsPasscode('KB1ABC'), aprsPasscode('kb1abc'))
})

test("the source is the callsign with the seat as its SSID and no other suffix", () => {
  assert.equal(aprsSource('KI2D'), 'KI2D')
  assert.equal(aprsSource('ki2d'), 'KI2D')
  // The second seat of a multi-station operation, as the app spells it.
  assert.equal(aprsSource('KI2D/OP2'), 'KI2D-2')
  // Seat 0 is the plain call — `-0` is what app-polo sends and it means the same.
  assert.equal(aprsSource('KI2D/OP0'), 'KI2D')
  // Portable and abroad are not APRS's to say; the callsign is the segment
  // that looks like one, whichever side the prefix is on.
  assert.equal(aprsSource('KI2D/P'), 'KI2D')
  assert.equal(aprsSource('W1/KI2D/P'), 'KI2D')
  assert.equal(aprsSource('VE3/KI2D/OP1'), 'KI2D-1')
  // Two calls spotted together: the first is the station.
  assert.equal(aprsSource('KI2D,N0DEV'), 'KI2D')
  assert.equal(aprsSource(''), '')
  assert.equal(aprsSource('  '), '')
})

test("a position is written in degrees and hundredths of minutes, zero-padded, with the car symbol", () => {
  // 42.3°N is 42° 18.00'; -71.8°W is 71° 48.00'.
  assert.equal(aprsPosition(42.3, -71.8), '!4218.00N/07148.00W>')
  // Single-digit degrees and a southern/eastern hemisphere still pad and
  // still carry a direction letter — a packet one character short misplaces
  // the station by a whole field.
  assert.equal(aprsPosition(-5.125, 8.5), '!0507.50S/00830.00E>')
})

test("the operation's coordinate is the position, its grid the fallback, and neither is nothing", () => {
  assert.deepEqual(positionOf({ lat: 42.3, lon: -71.8, grid: 'AA00' }), [42.3, -71.8])
  // A grid resolves to the square's centre.
  const [lat, lon] = positionOf({ grid: 'FN42' })!
  assert.equal(lat.toFixed(2), '42.50')
  assert.equal(lon.toFixed(2), '-71.00')
  assert.equal(positionOf({ grid: 'not a grid' }), undefined)
  assert.equal(positionOf({ lat: 0, lon: 0 }), undefined)
  assert.equal(positionOf({}), undefined)
})

test("the comment is the party token, the frequency in MHz, the counties, then the operator's words", () => {
  // Exactly the comment app-polo's QSO-party extension writes, which is what
  // the mobile trackers parse.
  assert.equal(aprsComment({ partyToken: 'NEWE', freq: 14250, refs: ['MAWOR', 'MAMID'] }), 'NEWE 14.250 MAWOR/MAMID')
  // Off a whole kHz the frequency keeps its thousands separator — `fmtFreq`'s
  // rendering, and app-polo's — rather than being rounded to what the
  // trackers print.
  assert.equal(aprsComment({ freq: 7235.5, refs: ['US-1234'], comment: ' QRV ' }), '7.235.500 US-1234 QRV')
  assert.equal(aprsComment({}), '')
  assert.equal(aprsComment({ comment: 'x'.repeat(60) }).length, COMMENT_MAX_LENGTH)
})

test("the packet and the login are the APRS-IS lines app-polo sends", () => {
  assert.equal(
    aprsPacket('KI2D-1', '!4218.00N/07148.00W>', 'NEWE 14.250 MAWOR'),
    'KI2D-1>APRS,TCPIP*:!4218.00N/07148.00W>NEWE 14.250 MAWOR',
  )
  assert.equal(aprsLogin('KI2D-1', '26.9.1'), 'user KI2D-1 pass 2799 vers Ham2K-HaLo 26.9.1')
})

test("base64 matches the standard encoding, padding included", () => {
  assert.equal(base64(''), '')
  assert.equal(base64('f'), 'Zg==')
  assert.equal(base64('fo'), 'Zm8=')
  assert.equal(base64('foo'), 'Zm9v')
  const login = 'user KI2D pass 2799 vers Ham2K-HaLo 26.9.1'
  assert.equal(base64(login), Buffer.from(login).toString('base64'))
})
