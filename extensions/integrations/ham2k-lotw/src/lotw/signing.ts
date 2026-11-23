// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
// LoTW v2 wire format and canonical signing fields.
// See assets/LoTW-SIGNING-NOTICE.txt for source attribution.
import manifest from '../../manifest.json' with { type: 'json' }
import { lotwModeFor } from './modes.ts'

export interface LotwStation {
  callsign: string
  dxcc: number
  grid?: string
  state?: string
  county?: string
  cqZone?: number
  ituZone?: number
  iota?: string
}

export interface LotwContact {
  id: string
  call: string
  band: string
  mode: string
  submode?: string
  date: string
  time: string
  frequencyMHz?: string
  bandRx?: string
  frequencyRxMHz?: string
  propagation?: string
  satellite?: string
}

export interface LotwCertificate {
  derBase64: string
  serial: string
  callsign: string
  dxcc: number
  validFromMillis: number
  validToMillis: number
  qsoFrom: string
  qsoTo?: string
}

export interface LotwSigningPort {
  certificate: LotwCertificate
  // This capability signs with the key matching certificate. The private key
  // stays with the provider. SHA-1 is required by the LoTW signature format.
  signSha1(canonicalAscii: string): Promise<string>
  gzip(ascii: string): Promise<Uint8Array>
}

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DC DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  ),
)
const CA_PROVINCES = new Map([
  ['AB', 'AB'],
  ['BC', 'BC'],
  ['MB', 'MB'],
  ['NB', 'NB'],
  ['NL', 'NF'],
  ['NS', 'NS'],
  ['NT', 'NT'],
  ['NU', 'NU'],
  ['ON', 'ON'],
  ['PE', 'PE'],
  ['QC', 'PQ'],
  ['SK', 'SK'],
  ['YT', 'YT'],
])
// Bands and propagation modes as TQSL's configuration lists them (see modes.ts).
const BANDS = new Set(
  (
    '2190M 630M 160M 80M 60M 40M 30M 20M 17M 15M 12M 10M 8M 6M 4M 2M 1.25M 70CM 33CM 23CM ' +
    '13CM 9CM 6CM 3CM 1.25CM 6MM 4MM 2.5MM 2MM 1MM SUBMM'
  ).split(' '),
)
const PROPAGATION_MODES = new Set(
  'AS AUE AUR BS ECH EME ES F2 FAI ION IRL MS RS SAT TEP TR'.split(' '),
)
/** The entities whose station subdivision LoTW signs: the USA's three, and Canada. */
export const US_ENTITIES = [6, 110, 291]
export const CANADA = 1
const STATION_ORDER = [
  'AU_STATE',
  'CA_PROVINCE',
  'CN_PROVINCE',
  'CQZ',
  'FI_KUNTA',
  'GRIDSQUARE',
  'IOTA',
  'ITUZ',
  'JA_CITY_GUN_KU',
  'JA_PREFECTURE',
  'RU_OBLAST',
  'US_COUNTY',
  'US_STATE',
]
const CONTACT_ORDER = [
  'BAND',
  'BAND_RX',
  'CALL',
  'FREQ',
  'FREQ_RX',
  'MODE',
  'PROP_MODE',
  'QSO_DATE',
  'QSO_TIME',
  'SAT_NAME',
]
const MAX_TQ8_BYTES = 512_000

/**
 * A contact LoTW will not take, in words the operator can act on. Its message
 * names the logged value, never a credential.
 */
export class LotwContactProblem extends Error {}

/** A logged value as a message may quote it: printable ASCII, kept short. */
export function shown(value: string): string {
  const text = value.replace(/[^\x20-\x7E]/g, '?').trim()
  return text.length > 24 ? `${text.slice(0, 24)}…` : text
}

function callsign(input: string): string {
  if (
    !/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/i.test(input) ||
    !/[a-z]/i.test(input) ||
    !/\d/.test(input) ||
    input.length < 3 ||
    input.length > 20 ||
    input.startsWith('0') ||
    (input.startsWith('1') && !/^1[AMS]/i.test(input))
  ) {
    throw new Error('Invalid LoTW callsign')
  }
  return input.toUpperCase()
}

function date(input: string): string {
  const value = new Date(`${input}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(0, 10) !== input
  ) {
    throw new Error('LoTW requires a valid UTC date')
  }
  return input
}

function base64(input: string, maxLength: number): string {
  if (
    !input.length ||
    input.length > maxLength ||
    input.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input)
  ) {
    throw new Error('Invalid LoTW certificate or signature encoding')
  }
  return input
}

function field(name: string, value: string): string {
  const type = name === 'SIGN_LOTW_V2.0' ? ':6' : ''
  return `<${name}:${value.length}${type}>${value}\n`
}

function stationFields(station: LotwStation): Record<string, string> {
  if (!Number.isInteger(station.dxcc) || station.dxcc < 1 || station.dxcc > 522) {
    throw new LotwContactProblem('The contact has no valid DXCC entity for its station.')
  }
  const fields: Record<string, string> = {
    CALL: callsign(station.callsign),
    DXCC: String(station.dxcc),
  }
  if (station.grid !== undefined) {
    if (!/^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/i.test(station.grid)) {
      throw new LotwContactProblem(`LoTW does not take the grid ${shown(station.grid)}.`)
    }
    fields.GRIDSQUARE = station.grid.toUpperCase()
  }
  for (const [name, zone, maximum] of [
    ['CQZ', station.cqZone, 40],
    ['ITUZ', station.ituZone, 90],
  ] as const) {
    if (zone === undefined) continue
    if (!Number.isInteger(zone) || zone < 1 || zone > maximum) {
      const kind = name === 'CQZ' ? 'CQ' : 'ITU'
      throw new LotwContactProblem(`LoTW does not take the ${kind} zone ${zone}.`)
    }
    fields[name] = String(zone)
  }
  if (station.iota !== undefined) {
    if (!/^(AF|AN|AS|EU|NA|OC|SA)-\d{3}$/i.test(station.iota)) {
      throw new LotwContactProblem(`LoTW does not take the IOTA reference ${shown(station.iota)}.`)
    }
    fields.IOTA = station.iota.toUpperCase()
  }
  if (station.state !== undefined || station.county !== undefined) {
    const state = station.state?.toUpperCase()
    if (US_ENTITIES.includes(station.dxcc)) {
      if (!state || !US_STATES.has(state)) {
        throw new LotwContactProblem(`LoTW does not take the state ${shown(station.state ?? '')}.`)
      }
      fields.US_STATE = state
      if (station.county !== undefined) {
        if (!/^[A-Z .'-]{1,64}$/i.test(station.county)) {
          throw new LotwContactProblem(`LoTW does not take the county ${shown(station.county)}.`)
        }
        fields.US_COUNTY = station.county.toUpperCase()
      }
    } else if (station.dxcc === CANADA) {
      const province = state === undefined ? undefined : CA_PROVINCES.get(state)
      if (!province) {
        throw new LotwContactProblem(`LoTW does not take the province ${shown(station.state ?? '')}.`)
      }
      if (station.county !== undefined) {
        throw new LotwContactProblem('LoTW takes no county for a station in Canada.')
      }
      fields.CA_PROVINCE = province
    } else {
      throw new LotwContactProblem('LoTW takes a state only for the USA and Canada.')
    }
  }
  return fields
}

function band(input: string): string {
  const value = input.toUpperCase()
  if (!BANDS.has(value)) throw new LotwContactProblem(`LoTW does not take the band ${shown(input)}.`)
  return value
}

function contactFields(contact: LotwContact): Record<string, string> {
  const mode = lotwModeFor(contact.mode, contact.submode)
  if (mode === undefined) {
    const named = contact.submode ? `${contact.mode} (${contact.submode})` : contact.mode
    throw new LotwContactProblem(`LoTW does not take the mode ${shown(named)}.`)
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(contact.time)) {
    throw new LotwContactProblem('The contact has no exact time, to the second, for LoTW.')
  }
  let call: string
  try {
    call = callsign(contact.call)
  } catch {
    throw new LotwContactProblem(`LoTW does not take the callsign ${shown(contact.call)}.`)
  }
  let qsoDate: string
  try {
    qsoDate = date(contact.date)
  } catch {
    throw new LotwContactProblem('The contact has no valid date for LoTW.')
  }
  const fields: Record<string, string> = {
    CALL: call,
    BAND: band(contact.band),
    MODE: mode,
    QSO_DATE: qsoDate,
    QSO_TIME: contact.time,
  }
  for (const [name, value] of [
    ['FREQ', contact.frequencyMHz],
    ['FREQ_RX', contact.frequencyRxMHz],
  ] as const) {
    if (value === undefined) continue
    if (
      value.length > 14 ||
      !/^\d+(?:\.\d{1,6})?$/.test(value) ||
      Number(value) <= 0 ||
      Number(value) > 1_000_000
    ) {
      throw new LotwContactProblem(`LoTW does not take the frequency ${shown(value)} MHz.`)
    }
    fields[name] = value
  }
  if (contact.bandRx !== undefined) fields.BAND_RX = band(contact.bandRx)
  if (contact.propagation !== undefined) {
    const value = contact.propagation.toUpperCase()
    if (!PROPAGATION_MODES.has(value)) {
      throw new LotwContactProblem(
        `LoTW does not take the propagation mode ${shown(contact.propagation)}.`,
      )
    }
    fields.PROP_MODE = value
  }
  if (contact.satellite !== undefined) {
    if (fields.PROP_MODE !== 'SAT') {
      throw new LotwContactProblem('A contact with a satellite name needs the propagation mode SAT.')
    }
    if (!/^[A-Z0-9 -]{1,32}$/i.test(contact.satellite)) {
      throw new LotwContactProblem(`LoTW does not take the satellite ${shown(contact.satellite)}.`)
    }
    fields.SAT_NAME = contact.satellite.toUpperCase()
  }
  if (fields.PROP_MODE === 'SAT' && !fields.SAT_NAME) {
    throw new LotwContactProblem('A satellite contact needs the satellite’s name for LoTW.')
  }
  return fields
}

function signingData(station: Record<string, string>, contact: Record<string, string>): string {
  return [
    ...STATION_ORDER.map((key) => station[key] ?? ''),
    ...CONTACT_ORDER.map((key) => contact[key] ?? ''),
  ].join('')
}

function requireCertificateDates(certificate: LotwCertificate, qsoDate: string): void {
  const { callsign, qsoFrom, qsoTo } = certificate
  if (qsoDate < qsoFrom || (qsoTo !== undefined && qsoDate > qsoTo)) {
    const range = qsoTo === undefined ? `from ${qsoFrom}` : `${qsoFrom} to ${qsoTo}`
    throw new LotwContactProblem(
      `The contact’s date, ${qsoDate}, is outside the dates the certificate for ${callsign} covers (${range}).`,
    )
  }
}

/**
 * Throws a LotwContactProblem when LoTW would not take this contact, from
 * this station, signed with this certificate. Checked per contact before
 * signing, so one contact LoTW refuses does not hold back the others.
 */
export function checkLotwContact(
  certificate: LotwCertificate,
  station: LotwStation,
  contact: LotwContact,
): void {
  if (station.callsign !== certificate.callsign) {
    throw new LotwContactProblem(
      `The contact was logged as ${shown(station.callsign)}, and the certificate is for ${certificate.callsign}.`,
    )
  }
  if (station.dxcc !== certificate.dxcc) {
    throw new LotwContactProblem(
      `The contact’s station is in DXCC entity ${station.dxcc}, and the certificate for ${certificate.callsign} is for entity ${certificate.dxcc}.`,
    )
  }
  stationFields(station)
  requireCertificateDates(certificate, contactFields(contact).QSO_DATE)
}

function requireUsableCertificate(certificate: LotwCertificate, nowMillis: number): void {
  const { validFromMillis, validToMillis, qsoFrom, qsoTo } = certificate
  if (
    ![nowMillis, validFromMillis, validToMillis].every(Number.isFinite) ||
    nowMillis < validFromMillis ||
    nowMillis > validToMillis
  ) {
    throw new Error('LoTW certificate is outside its validity period')
  }
  date(qsoFrom)
  if (qsoTo !== undefined && date(qsoTo) < qsoFrom) {
    throw new Error('LoTW certificate has an invalid QSO date range')
  }
}

export function requireTq8Bytes(tq8: Uint8Array): void {
  if (
    tq8.length < 18 ||
    tq8.length > MAX_TQ8_BYTES ||
    tq8[0] !== 0x1f ||
    tq8[1] !== 0x8b ||
    tq8[2] !== 8
  ) {
    throw new Error('LoTW requires a bounded gzip TQ8 file')
  }
}

export async function buildSignedTq8(
  port: LotwSigningPort,
  station: LotwStation,
  contacts: readonly LotwContact[],
  nowMillis: number,
): Promise<Uint8Array> {
  if (contacts.length === 0 || contacts.length > 100) {
    throw new Error('LoTW signed batch must contain 1 to 100 contacts')
  }
  const { certificate } = port
  requireUsableCertificate(certificate, nowMillis)
  if (callsign(station.callsign) !== certificate.callsign || station.dxcc !== certificate.dxcc) {
    throw new Error('LoTW station callsign and DXCC must match the certificate')
  }
  const own = stationFields(station)
  const seen = new Set<string>()
  const batch = contacts.map((contact) => {
    if (!contact.id || seen.has(contact.id)) throw new Error('LoTW contacts must have unique IDs')
    seen.add(contact.id)
    const fields = contactFields(contact)
    requireCertificateDates(certificate, fields.QSO_DATE)
    return fields
  })
  const records = [
    field('TQSL_IDENT', `Ham2K Logger LoTW ${manifest.version}`),
    field('REC_TYPE', 'tCERT'),
    field('CERT_UID', '1'),
    field('CERTIFICATE', base64(certificate.derBase64, 16_384)),
    '<eor>\n',
    field('REC_TYPE', 'tSTATION'),
    field('STATION_UID', '1'),
    field('CERT_UID', '1'),
    ...Object.entries(own).map(([name, value]) => field(name, value)),
    '<eor>\n',
  ]
  for (const contact of batch) {
    const canonical = signingData(own, contact)
    const signature = base64(await port.signSha1(canonical), 684)
    records.push(
      field('REC_TYPE', 'tCONTACT'),
      field('STATION_UID', '1'),
      ...Object.entries(contact).map(([name, value]) => field(name, value)),
      field('SIGN_LOTW_V2.0', signature),
      field('SIGNDATA', canonical),
      '<eor>\n',
    )
  }
  const bytes = await port.gzip(records.join(''))
  requireTq8Bytes(bytes)
  return bytes
}
