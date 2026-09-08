// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The exchange on its way in (what the entry row offers) and on its way out
// (what the sponsor receives). The Cabrillo cases are the ones that matter most:
// a file is submitted once, months after the contest, and nobody reads it before
// it goes.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { JSONValue } from "@ham2k/extension-sdk"

import {
  cabrilloCall,
  cabrilloCategories,
  cabrilloFor,
  cabrilloRowsFor,
  claimableBand,
  exchangeInheritPrefix,
  exchangeOptionsFor,
  exchangeTransforms,
  fallbackTheirLocation,
  hasSegments,
  ourLocationForQso,
  preferredCodesFor,
  resolvedExchanges,
  theirLocationForFile,
} from "./exchange.ts"
import type { QsoPartyParams } from "./params.ts"
import { resolveParty } from "./party.ts"
import { ACQP, CA, ID, MD, MN, NY, SEVEN_QP, WA, WI } from "./testFixtures.ts"

const ny = resolveParty(NY)

function operation(location: string, params: QsoPartyParams = NY): Record<string, JSONValue> {
  return { uuid: 'op', stationCall: 'N0DEV', refs: [{ type: params.refType, location }] }
}

function qso(
  { call = 'K1ABC', location, ourLocation, entityPrefix = 'K', state, mode = 'CW', params = NY }: {
    call?: string
    location?: string
    ourLocation?: string
    entityPrefix?: string
    state?: string
    mode?: string
    params?: QsoPartyParams
  } = {},
): Record<string, JSONValue> {
  return {
    their: { call, ...(entityPrefix ? { entityPrefix } : {}), ...(state ? { state } : {}) },
    band: '20m',
    mode,
    refs: [{
      type: params.refType,
      ...(location !== undefined ? { location } : {}),
      ...(ourLocation ? { ourLocation } : {}),
    }],
  }
}

test('a county line submits one row per pairing', () => {
  // Each pairing is what the checker matches against the other station's log, so
  // a line-to-line contact is four lines, not one.
  const rows = cabrilloRowsFor(ny, qso({ location: 'ERI/CHA' }), operation('ALB/REN'), 'N0DEV')
  assert.equal(rows.length, 4)
  const pairs = rows.map((row) => [row[2].trim(), row[5].trim()])
  assert.deepEqual(pairs, [['ALB', 'ERI'], ['ALB', 'CHA'], ['REN', 'ERI'], ['REN', 'CHA']])
})

test('on a segmented log, the county WE were in comes from the contact', () => {
  // A rover's county changes mid-log and the export sees only the base
  // operation, so the stamp on the contact is the only record of where it was
  // actually made.
  const roving = qso({ location: 'ERI', ourLocation: 'REN' })
  assert.equal(ourLocationForQso(ny, roving, operation('ALB'), { segmented: true }), 'REN')
  const rows = cabrilloRowsFor(ny, roving, operation('ALB'), 'N0DEV', { segmented: true })
  assert.equal(rows[0][2].trim(), 'REN')
  // A contact with no stamp — synced, or logged before this shipped — falls back
  // to the operation's own county rather than exporting a blank column.
  assert.equal(ourLocationForQso(ny, qso({ location: 'ERI' }), operation('ALB'), { segmented: true }), 'ALB')
})

test('without segments, a corrected county reaches the file', () => {
  // The stamp is written once and never revised. An operator who logs 30
  // contacts, notices the county is a typo and fixes it in setup rescores the
  // whole log — and on an unsegmented log the operation's location is true of
  // every contact in it, so the file has to follow rather than submit the county
  // that was typed by mistake.
  const stamped = qso({ location: 'ERI', ourLocation: 'ALB' })
  assert.equal(ourLocationForQso(ny, stamped, operation('ALL'), { segmented: false }), 'ALL')
  assert.equal(cabrilloRowsFor(ny, stamped, operation('ALL'), 'N0DEV')[0][2].trim(), 'ALL')
})

test('the stamp is written once, so an edit cannot move an old contact', () => {
  // A rover who fixes a callsign typo an hour later would otherwise have that
  // contact re-stamped with wherever they are now — the Cabrillo claiming a
  // county they were not in when they made it, against a scoreboard still
  // counting the one they were.
  const stamped = qso({ location: 'ERI', ourLocation: 'ALB' })
  assert.equal(ourLocationForQso(ny, stamped, operation('REN'), { segmented: true }), 'ALB')
})

test('a log knows whether it has segments, from the rows it carries', () => {
  const contact = qso({ location: 'ERI' })
  assert.equal(hasSegments([contact]), false)
  // An event row that restates the operation is a segment; a note or a plain
  // break carrying no override is not.
  assert.equal(hasSegments([contact, { band: 'event', event: { event: 'note' } }]), false)
  assert.equal(hasSegments([contact, { band: 'event', event: { event: 'break' } }]), false)
  assert.equal(
    hasSegments([contact, { band: 'event', event: { event: 'break', operation: { refs: [] } } }]),
    true,
  )
})

test('a log whose only break was deleted is not a segmented log', () => {
  // The core's segment resolution skips deleted rows, so this has to as well —
  // otherwise the export keeps preferring a stamp that nothing will revise, on a
  // log that is not segmented at all.
  const segment = { band: 'event', event: { event: 'break', operation: { refs: [] } } }
  assert.equal(hasSegments([qso({ location: 'ERI' }), segment]), true)
  assert.equal(hasSegments([qso({ location: 'ERI' }), { ...segment, deleted: true }]), false)
})

test('a serial and a name are columns only for the parties that exchange them', () => {
  // Every column shifts when one is added, so a party that does not trade serials
  // must not get an empty one.
  const plain = cabrilloRowsFor(ny, qso({ location: 'ERI' }), operation('ALB'), 'N0DEV')
  assert.equal(plain[0].length, 6)

  const ca = operation('ALAM', CA)
  const caQso = {
    their: { call: 'K1ABC', entityPrefix: 'K' },
    band: '20m',
    mode: 'CW',
    refs: [{ type: CA.refType, location: 'BUTT', ourSerial: '12', theirSerial: '34' }],
  }
  const rows = cabrilloRowsFor(resolveParty(CA), caQso, ca, 'N0DEV')
  assert.equal(rows[0].length, 8)
  assert.equal(rows[0][2].trim(), '12')
  assert.equal(rows[0][6].trim(), '34')

  // And the party that trades NAMES gets its own column, from the operation for
  // ours and the contact for theirs.
  const mn = { ...operation('AITK', MN), refs: [{ type: MN.refType, location: 'AITK', ourName: 'Sebastian' }] }
  const mnQso = {
    their: { call: 'K1ABC', entityPrefix: 'K' },
    band: '20m',
    mode: 'CW',
    refs: [{ type: MN.refType, location: 'ANOK', theirName: 'Steve' }],
  }
  const named = cabrilloRowsFor(resolveParty(MN), mnQso, mn, 'N0DEV')
  assert.equal(named[0][2].trim(), 'SEBASTIAN')
  assert.equal(named[0][6].trim(), 'STEVE')
})

test('a contact with nobody in the party is left out of the file', () => {
  // Two out-of-party stations working each other is not a contest QSO — the
  // scorer awards it nothing, and a file claiming it is an over-claim a checker
  // will strike.
  const outside = operation('NJ')
  assert.deepEqual(cabrilloRowsFor(ny, qso({ location: 'CT' }), outside, 'N0DEV'), [])
  // One end inside is a contest QSO, whichever end it is.
  assert.equal(cabrilloRowsFor(ny, qso({ location: 'ERI' }), outside, 'N0DEV').length, 1)
  assert.equal(cabrilloRowsFor(ny, qso({ location: 'CT' }), operation('ALB'), 'N0DEV').length, 1)
})

test('an exchange nobody copied is not invented for the file', () => {
  // The scorer refuses to score a contact whose exchange was never typed
  // (`missingExchange`), so writing the lookup's guessed state into the file
  // would claim a contact the scoreboard already declined.
  assert.equal(fallbackTheirLocation(ny, qso({ state: 'NJ' })), '')
  assert.deepEqual(
    cabrilloRowsFor(ny, qso({ state: 'NJ' }), operation('ALB'), 'N0DEV'),
    [],
    'a contact with nothing to claim is not claimed',
  )

  // A DX station's exchange IS their entity — nobody asks them to send one, so
  // this is what they gave us, not a guess.
  assert.equal(fallbackTheirLocation(ny, qso({ entityPrefix: 'DL' })), 'DX')
  // And where a party asks for the prefix instead of the word DX.
  assert.equal(fallbackTheirLocation(resolveParty(WA), qso({ entityPrefix: 'DL' })), 'DL')
})

test('the file claims a contact only where the score does', () => {
  // Both sides ask the same question — is one END of this contact wholly inside
  // the party — so a row cannot appear for a contact worth zero. An out-of-party
  // entrant working a county line half outside the party is the case the two
  // readings disagree on.
  const outside = operation('CA')
  assert.deepEqual(cabrilloRowsFor(ny, qso({ location: 'ERI/NJ' }), outside, 'N0DEV'), [])
  // Wholly inside, and it counts.
  assert.equal(cabrilloRowsFor(ny, qso({ location: 'ERI/CHA' }), outside, 'N0DEV').length, 2)
})

test('the file says what the scoreboard claimed for an Alaskan contact', () => {
  // The scorer credits an Alaskan station as the state `AK`; a file writing `DX`
  // for the same contact would not support the multiplier already claimed.
  assert.equal(fallbackTheirLocation(ny, qso({ entityPrefix: 'KL' })), 'AK')
  assert.equal(fallbackTheirLocation(ny, qso({ entityPrefix: 'KH6' })), 'HI')
})

test('a rover suffix is stripped only where the sponsor asked for it', () => {
  assert.equal(cabrilloCall(resolveParty(ID), 'K7ABC/ADA'), 'K7ABC')
  assert.equal(cabrilloCall(ny, 'K2ABC/M'), 'K2ABC/M')
})

test('the entry row offers what the station being worked could possibly send', () => {
  // A US station may send a county or a state…
  const us = exchangeOptionsFor(ny, qso({ entityPrefix: 'K' })).map((option) => option.code)
  assert.ok(us.includes('ALB'))
  assert.ok(us.includes('NJ'))
  // …a Canadian station in a US party can only send a province…
  const ve = exchangeOptionsFor(ny, qso({ entityPrefix: 'VE' })).map((option) => option.code)
  assert.equal(ve.includes('ALB'), false)
  assert.ok(ve.includes('ON'))
  // …and a DX station sends their entity, which is not a list at all, so the
  // field accepts whatever the operator heard.
  assert.deepEqual(exchangeOptionsFor(ny, qso({ entityPrefix: 'DL' })), [])
  // A Canadian party is the mirror image.
  const acqp = resolveParty(ACQP)
  const acqpVe = exchangeOptionsFor(acqp, qso({ entityPrefix: 'VE' })).map((option) => option.code)
  assert.ok(acqpVe.some((code) => acqp.counties[code] !== undefined))
  assert.equal(
    exchangeOptionsFor(acqp, qso({ entityPrefix: 'K' })).some((option) => acqp.counties[option.code]),
    false,
  )
})

test('the county-line shorthand is declared, not rewritten', () => {
  // A rewrite cannot tell the shorthand from the same letters on the way to the
  // full code: after `IDADA/`, `IDA` is either Idaho county's shorthand or the
  // first three characters of `IDIDA`, and real counties have that shape. The
  // field matches and validates both readings and rewrites neither.
  assert.equal(exchangeInheritPrefix(resolveParty(SEVEN_QP)), 2)
  // A party whose codes are three letters has no shorthand at all…
  assert.equal(exchangeInheritPrefix(ny), 0)
  // …and the only live rewrite left is the comma an operator may reach for.
  assert.deepEqual(exchangeTransforms(ny), [{ pattern: ',', replacement: '/', flags: 'g' }])
  assert.deepEqual(exchangeTransforms(resolveParty(WI)), [])
})

test('DC is offered, because stations send it', () => {
  // Whether DC is its own multiplier is a per-party rule, so it is not in the
  // states table — but it is still a value stations SEND, and left out of the
  // list the field tints a perfectly good exchange as unknown while the scorer
  // accepts it.
  for (const params of [NY, MD]) {
    const codes = exchangeOptionsFor(resolveParty(params), qso({ entityPrefix: 'K' })).map((o) => o.code)
    assert.ok(codes.includes('DC'), `${params.short} does not offer DC`)
  }
  // And it reads as whatever that party calls it.
  const offered = (params: QsoPartyParams) =>
    exchangeOptionsFor(resolveParty(params), qso({ entityPrefix: 'K' })).find((o) => o.code === 'DC')?.name
  assert.equal(offered(NY), 'Maryland & DC')
  assert.equal(offered(MD), 'District of Columbia')
})

test("a party offers its neighbours' counties, because its entrants work them", () => {
  const codes = exchangeOptionsFor(resolveParty(SEVEN_QP), qso({ entityPrefix: 'K' })).map((o) => o.code)
  assert.ok(codes.includes('ORDES'))
  // A neighbouring party's county — a valid exchange, and not one of this
  // party's own.
  assert.ok(codes.includes('CASCL'))
  assert.equal(resolveParty(SEVEN_QP).counties.CASCL, undefined)
})

test('the guessed state floats its counties up, and never fills the field', () => {
  // Ranking rather than prefilling: a location guess is wrong often enough that
  // writing it in would be worse than useless.
  const preferred = preferredCodesFor(resolveParty(SEVEN_QP), 'OR')
  assert.ok(preferred.includes('ORDES'))
  assert.ok(preferred.includes('OR'))
  assert.equal(preferred.some((code) => code.startsWith('WA')), false)
  assert.deepEqual(preferredCodesFor(ny, ''), [])
})

test('the declared entry classes become the Cabrillo CATEGORY lines', () => {
  // The reason the classes are captured at all: a submitted log declares its
  // entry in these lines, and a checker reads them rather than guessing.
  const lines = (ref: Record<string, JSONValue>) =>
    Object.fromEntries(
      cabrilloCategories(ny, { uuid: 'op', refs: [{ type: NY.refType, ...ref }] }).filter(([, v]) => v),
    )

  assert.deepEqual(lines({ operator: 'SINGLE-OP', power: 'LOW', station: 'MOBILE', mode: 'CW' }), {
    'CATEGORY-OPERATOR': 'SINGLE-OP',
    'CATEGORY-POWER': 'LOW',
    'CATEGORY-STATION': 'MOBILE',
    'CATEGORY-MODE': 'CW',
  })

  // Cabrillo keeps the transmitter count apart from the operator class, while
  // sponsors publish them as one ("Multi-Single"), so it splits on the way out.
  assert.deepEqual(lines({ operator: 'MULTI-ONE' }), {
    'CATEGORY-OPERATOR': 'MULTI-OP',
    'CATEGORY-TRANSMITTER': 'ONE',
  })
  assert.equal(lines({ operator: 'MULTI-UNLIMITED' })['CATEGORY-TRANSMITTER'], 'UNLIMITED')

  // Phone is SSB in a Cabrillo header, and digital is DIGI.
  assert.equal(lines({ mode: 'PHONE' })['CATEGORY-MODE'], 'SSB')
  assert.equal(lines({ mode: 'DIGITAL' })['CATEGORY-MODE'], 'DIGI')

  // An unanswered question emits NO line: an omitted category is "no claim",
  // while a guessed one is a claim the operator never made.
  assert.deepEqual(lines({}), {})

  // A class the party does not publish is refused rather than submitted — this
  // party has no EOC class, and a value left behind by another setup must not
  // reach a checker under it.
  assert.deepEqual(lines({ station: 'EOC' }), {})
})

test('the file and the scoreboard agree about a blank exchange, both ways', () => {
  // The scorer remembers what a station sent the first time, so a second contact
  // on another band scores under that county. An export reading the ref raw
  // writes NO row for it — a file claiming fewer contacts than the scoreboard.
  const lastLocation: Record<string, string> = {}
  const first = cabrilloRowsFor(ny, qso({ location: 'ERI' }), operation('ALB'), 'N0DEV', { lastLocation })
  assert.equal(first.length, 1)
  const second = cabrilloRowsFor(ny, qso({}), operation('ALB'), 'N0DEV', { lastLocation })
  assert.equal(second.length, 1, 'the remembered county carries the second contact')
  assert.equal(second[0][5].trim(), 'ERI')

  // And the other direction: an exchange that resolves to nothing scores zero
  // with `invalidExchange`, so no row may be written for it either.
  assert.deepEqual(cabrilloRowsFor(ny, qso({ location: 'XYZ' }), operation('ALB'), 'N0DEV'), [])
})

test('both files write what the station SENT, which is not always what it scores as', () => {
  // A party that logs a DX station by its entity prefix still scores it as the
  // single `DX` multiplier. Resolving the prefix to `DX` before the file is
  // written makes the Cabrillo say `DX` and the ADIF say `DL`, and the option
  // changes nothing at all.
  const wa = resolveParty(WA)
  const dx = qso({ location: '', entityPrefix: 'DL', call: 'DL1ABC', params: WA })
  assert.equal(theirLocationForFile(wa, dx, { weAreInParty: true }), 'DL')
  const rows = cabrilloRowsFor(wa, dx, operation('KING', WA), 'N0DEV')
  assert.equal(rows[0][5].trim(), 'DL', 'the Cabrillo says what the ADIF says')

  // A party that logs them as plain `DX` still gets `DX`.
  assert.equal(theirLocationForFile(ny, qso({ location: '', entityPrefix: 'DL', call: 'DL1ABC' }), {
    weAreInParty: true,
  }), 'DX')
})

test('the ADIF and the Cabrillo agree about a remembered exchange', () => {
  // `adifFields` sees one contact at a time and cannot know what a station sent
  // earlier — so the export resolves the whole log up front and hands the
  // answers over.
  const first = { ...qso({ location: 'ERI' }), uuid: 'q1' }
  const second = { ...qso({}), uuid: 'q2', band: '40m' }
  const resolved = resolvedExchanges(ny, operation('ALB'), [first, second], { segmented: false })
  assert.equal(resolved.q1, 'ERI')
  assert.equal(resolved.q2, 'ERI', 'the second contact carries the county from the first')
  // Event rows and deleted contacts are not contacts.
  const withNoise = resolvedExchanges(ny, operation('ALB'),
    [first, { band: 'event', uuid: 'e1' }, { ...second, deleted: true }], { segmented: false })
  assert.deepEqual(Object.keys(withNoise), ['q1'])
})

test('the file claims no contact the scoreboard refused, and learns nothing from one', () => {
  // A 30m contact scores `invalidBand` at zero. Written into the Cabrillo anyway
  // its exchange is also remembered, so the next blank exchange from that station
  // resolves to a county the scoresheet never recorded.
  assert.equal(claimableBand('20m'), true)
  assert.equal(claimableBand('30m'), false)
  assert.equal(claimableBand(''), false)

  const lastLocation: Record<string, string> = {}
  const warc = { ...qso({ location: 'ERI' }), band: '30m' }
  assert.deepEqual(cabrilloRowsFor(ny, warc, operation('ALB'), 'N0DEV', { lastLocation }), [])
  assert.deepEqual(lastLocation, {}, 'a refused contact teaches the file nothing')

  // And the same station on a legal band with a blank exchange is therefore
  // unclaimable too, exactly as the scorer sees it.
  assert.deepEqual(cabrilloRowsFor(ny, qso({}), operation('ALB'), 'N0DEV', { lastLocation }), [])
})

test('the whole file: a header a checker can read, and one line per contact', () => {
  const op = {
    uuid: 'op',
    stationCall: 'N0DEV',
    grid: 'FN32',
    refs: [{ type: NY.refType, location: 'ALB', operator: 'SINGLE-OP', power: 'LOW', email: 'sd@ham2k.com' }],
  }
  const file = cabrilloFor(ny, op, [
    { ...qso({ location: 'ERI' }), startAtMillis: Date.UTC(2026, 9, 17, 14, 30) },
    // A contact the scorer refuses is not in the file either.
    { ...qso({ location: 'ERI' }), band: '30m', startAtMillis: Date.UTC(2026, 9, 17, 14, 31) },
  ], { segmented: false })

  const lines = file.split('\n')
  assert.ok(lines.includes('CONTEST: NY-QSO-PARTY'))
  assert.ok(lines.includes('CALLSIGN: N0DEV'))
  assert.ok(lines.includes('LOCATION: ALB'))
  assert.ok(lines.includes('CATEGORY-OPERATOR: SINGLE-OP'))
  assert.ok(lines.includes('CATEGORY-POWER: LOW'))
  assert.ok(lines.includes('EMAIL: sd@ham2k.com'))
  assert.ok(lines.includes('GRID-LOCATOR: FN32'))
  const qsos = lines.filter((line) => line.startsWith('QSO:'))
  assert.equal(qsos.length, 1)
  assert.match(qsos[0], /^QSO: 14000 CW 2026-10-17 1430 N0DEV\s+599\s+ALB\s+K1ABC\s+599\s+ERI\s*$/)
})
