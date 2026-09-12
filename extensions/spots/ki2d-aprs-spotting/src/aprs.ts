// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The APRS position report a self-spot becomes, and the APRS-IS login that
// carries it. Pure: everything here is a string from its inputs, so that the
// packet an operator's call and position produce can be read in a test.
//
// The packet is the one app-polo's QSO-party extension sends, and the wire
// format is APRS-IS's own:
//   https://www.aprs-is.net/SendOnlyPorts.aspx
//   https://ham.packet-radio.net/packet/aprs-wb2osz/Understanding-APRS-Packets.pdf

import { gridToLocation, latitudeInMinutes, longitudeInMinutes } from "@ham2k/lib-geo-tools"
import { fmtFreq } from "@ham2k/lib-format-tools"

/// The APRS-IS passcode is a public hash of the base callsign — every client
/// derives it, and so does every server, which is why posting needs no
/// account.
export function aprsPasscode(call: string): number {
  const base = call.toUpperCase().split('-')[0]
  let passcode = 29666
  for (let index = 0; index < base.length; index += 2) {
    passcode ^= base.charCodeAt(index) * 256
    passcode ^= base.charCodeAt(index + 1) || 0
  }
  return passcode & 32767
}

/// An APRS source is `CALL` or `CALL-SSID`, and a station call as the app
/// spots it is not: `KI2D/OP1` for the second seat of a multi-station
/// operation, `W1/KI2D/P` abroad and portable, `KI2D,N0DEV` for a station
/// spotting two calls. The callsign proper is the slash-separated segment
/// that looks like one — carries a digit, longest — and the seat becomes the
/// SSID, which is the same number app-polo puts there. Everything else a
/// suffix says is not APRS's to carry.
export function aprsSource(stationCall: string): string {
  const first = stationCall.split(',')[0].trim().toUpperCase()
  if (!first) return ''
  const segments = first.split('/').filter((s) => s)
  const seat = segments.find((s) => /^OP\d+$/.test(s))?.slice(2)
  const base = segments
    .filter((s) => !/^OP\d+$/.test(s))
    .filter((s) => /\d/.test(s))
    .sort((a, b) => b.length - a.length)[0] ?? segments[0]
  const ssid = seat ? Number.parseInt(seat, 10) : 0
  return ssid > 0 ? `${base}-${ssid}` : base
}

/// The APRS symbol every beacon carries: `/>`, a car. app-polo sends `/(`,
/// which the symbol table lists as a mobile satellite station; a self-spot
/// is a station operating away from home, and a car is the honest default
/// for one.
const SYMBOL_TABLE = '/'
const SYMBOL_CODE = '>'

/// `!DDMM.mmN/DDDMM.mmW>` — an uncompressed position report with no
/// timestamp and no messaging, followed by the symbol.
export function aprsPosition(lat: number, lon: number): string {
  const la = latitudeInMinutes(lat)
  const lo = longitudeInMinutes(lon)
  return [
    '!',
    String(la.degrees).padStart(2, '0'),
    la.fractionalMinutes.toFixed(2).padStart(5, '0'),
    la.direction,
    SYMBOL_TABLE,
    String(lo.degrees).padStart(3, '0'),
    lo.fractionalMinutes.toFixed(2).padStart(5, '0'),
    lo.direction,
    SYMBOL_CODE,
  ].join('')
}

/// Where an operation is: its coordinate when it has one, the centre of its
/// grid otherwise, nothing when it has neither. The coordinate outranks the
/// grid — docs/design/locations.md — and a grid that does not parse is no
/// position rather than an error, because it is the operator's own typing.
export function positionOf(operation: Record<string, unknown>): [number, number] | undefined {
  const lat = Number(operation.lat)
  const lon = Number(operation.lon)
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return [lat, lon]
  const grid = typeof operation.grid === 'string' ? operation.grid.trim() : ''
  if (!grid) return undefined
  try {
    return gridToLocation(grid)
  } catch {
    return undefined
  }
}

/// A position report's comment is 43 characters at most; APRS-IS carries
/// more, but a radio on the far side of an igate does not.
export const COMMENT_MAX_LENGTH = 43

export interface BeaconFields {
  /// The token a party's tracker files a station under — `NEWE`. First,
  /// because the tracker reads it there: `NJQP 14.230` is what its page asks
  /// for.
  partyToken?: string
  /// kHz; written as MHz, `14.250`.
  freq?: number
  /// What the operation is activating, in the words a chaser reads — county
  /// codes for a QSO party, references otherwise.
  refs?: string[]
  comment?: string
}

export function aprsComment({ partyToken, freq, refs, comment }: BeaconFields): string {
  return [partyToken, freq ? fmtFreq(freq) : '', (refs ?? []).join('/'), comment?.trim()]
    .filter((part) => part)
    .join(' ')
    .slice(0, COMMENT_MAX_LENGTH)
}

/// `KI2D-1>APRS,TCPIP*:!4218.00N/07148.00W>NEWE 14.250 MAWOR`. The path
/// says the packet was born on the internet and is not to be gated back to RF
/// by everyone who hears it.
export function aprsPacket(source: string, position: string, comment: string): string {
  return `${source}>APRS,TCPIP*:${position}${comment}`
}

/// The login line an APRS-IS server reads before the packet. `vers` names the
/// software, which is how a server operator finds the client behind a bad
/// packet.
export function aprsLogin(source: string, version: string): string {
  return `user ${source} pass ${aprsPasscode(source)} vers Ham2K-HaLo ${version}`
}

/// Base64 for the login header. Written out because the sandbox has no
/// `btoa` and no `Buffer`; the input is ASCII, which is all a login line is.
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i) & 0xff
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) & 0xff : NaN
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) & 0xff : NaN
    out += BASE64[a >> 2]
    out += BASE64[((a & 3) << 4) | ((Number.isNaN(b) ? 0 : b) >> 4)]
    out += Number.isNaN(b) ? '=' : BASE64[((b & 15) << 2) | ((Number.isNaN(c) ? 0 : c) >> 6)]
    out += Number.isNaN(c) ? '=' : BASE64[c & 63]
  }
  return out
}
