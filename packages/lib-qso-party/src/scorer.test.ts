// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// QSO-party scoring. Two kinds of test here, and the second kind is the point:
//
//   * the ordinary business — points by mode, multipliers, duplicates;
//   * the rules that only ONE party has, which is where an engine silently
//     loses things. Every option a shipped party sets is exercised against the
//     party that sets it, so a change that stops reading one fails here rather
//     than quietly scoring nothing.
//
// The rover cases are the subject this engine exists for: our county comes from
// the ref handed to `scoreQso`, which the host resolves per segment, so "we
// moved" is modelled by scoring later QSOs against a different ref.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { JSONValue, ScoreTally } from "@ham2k/extension-sdk"

import { registerEntityLookup } from "./dxcc.ts"
import { ourPowerClass } from "./entry.ts"
import type { QsoPartyScoresheet } from "./index.ts"
import type { QsoPartyParams } from "./params.ts"
import { resolveParty } from "./party.ts"
import { multiplierPrefix, qsoPartyScorer } from "./scorer.ts"
import { ACQP, CO, DE, ID, IL, ME, NC, NEQP, NH, NV, NY, OH, SC, SEVEN_QP, TN, WI, WV } from "./testFixtures.ts"

const ctx = { online: false } as never

interface QsoSpec {
  call?: string
  band?: string
  mode?: string
  /// What they sent us.
  location?: string
  entityPrefix?: string
  refType?: string
}

function qso(
  { call = 'K1ABC', band = '20m', mode = 'CW', location, entityPrefix = 'K', refType = NY.refType }: QsoSpec = {},
): Record<string, JSONValue> {
  return {
    their: { call, ...(entityPrefix ? { entityPrefix } : {}) },
    band,
    mode,
    ...(location !== undefined ? { refs: [{ type: refType, location }] } : {}),
  }
}

interface RunOptions {
  params?: QsoPartyParams
  /// Where WE are. A list models a rover: the nth QSO is scored against the nth
  /// location, the last one standing for the rest.
  ourLocation?: string | string[]
  mobile?: boolean
  power?: string
  station?: string
}

function run(
  qsos: Record<string, JSONValue>[],
  { params = NY, ourLocation = 'ALB', mobile, power, station }: RunOptions = {},
) {
  const scorer = qsoPartyScorer(params)
  const locations = Array.isArray(ourLocation) ? ourLocation : [ourLocation]
  const refFor = (index: number): Record<string, JSONValue> => ({
    type: params.refType,
    location: locations[Math.min(index, locations.length - 1)],
    ...(mobile ? { mobile } : {}),
    ...(power ? { power } : {}),
    ...(station ? { station } : {}),
  })
  const operation: Record<string, JSONValue> = { uuid: 'op', stationCall: 'N0DEV', refs: [refFor(0)] }

  let sheet: QsoPartyScoresheet = scorer.startScoresheet({ operation, ref: refFor(0) }, ctx)
  const scores = qsos.map((q, index) => {
    const ref = refFor(index)
    const result = scorer.scoreQso(
      { scoresheet: sheet, qso: q, operation: { ...operation, refs: [ref] }, ref, isNewDay: false },
      ctx,
    )
    sheet = result.scoresheet
    return result.score
  })
  const summary = (scope: 'operation' | 'day' = 'operation'): ScoreTally =>
    scorer.summarizeScore({ scoresheet: sheet, operation, ref: refFor(0), scope }, ctx)[params.refType]
  return { sheet, scores, summary }
}

const multsOf = (result: ReturnType<typeof run>) => Object.keys(result.sheet.mults).length

test('points come from the mode, per party', () => {
  assert.equal(run([qso({ mode: 'SSB', location: 'ERI' })]).scores[0].value, 1)
  assert.equal(run([qso({ mode: 'CW', location: 'ERI' })]).scores[0].value, 2)
  // A digital mode nobody lists by name still prices as the sponsor's data rate.
  assert.equal(run([qso({ mode: 'FT8', location: 'ERI' })]).scores[0].value, 3)
})

test('a county line is worth every pairing of counties', () => {
  // Both of us on a line: four contacts in one exchange, and four multipliers.
  const { scores, sheet } = run([qso({ location: 'ERI/CHA' })], { ourLocation: 'ALB/REN' })
  assert.equal(scores[0].value, 2 * 2 * 2)
  assert.deepEqual(Object.keys(sheet.mults).sort(), ['CHA', 'ERI', 'NY'])
})

test('the WARC bands do not count, and neither does a QSO with no band', () => {
  assert.deepEqual(run([qso({ band: '30m', location: 'ERI' })]).scores[0].alerts, ['invalidBand'])
  assert.deepEqual(run([qso({ band: '', location: 'ERI' })]).scores[0].alerts, ['invalidBand'])
})

test('nothing scores until the operator says where WE are', () => {
  // Every contact is worth ours × theirs, so with no county of our own the whole
  // log is zero — and silently, unless it is said out loud.
  const { scores } = run([qso({ location: 'ERI' })], { ourLocation: '' })
  assert.equal(scores[0].value, 0)
  assert.deepEqual(scores[0].alerts, ['ourLocation'])
})

test('an exchange that was never sent, and one that means nothing', () => {
  assert.deepEqual(run([qso({ location: '' })]).scores[0].alerts, ['missingExchange'])
  assert.deepEqual(run([qso({ location: 'ZZZ', entityPrefix: '' })]).scores[0].alerts, ['invalidExchange'])
})

test('a typo from a US station is a bad exchange, not a DX contact', () => {
  // `K` is an entity, so a resolution that ends in "any entity at all means DX"
  // scores a mistyped county — and claims a `DX:K` multiplier in every party
  // that counts entities separately.
  const { scores, sheet } = run([qso({ location: 'ALBA' })])
  assert.equal(scores[0].value, 0)
  assert.deepEqual(scores[0].alerts, ['invalidExchange'])
  assert.deepEqual(sheet.entities, {})
  // A station in a country that is genuinely DX still resolves to DX.
  assert.ok((run([qso({ location: 'ZZZ', entityPrefix: 'DL' })]).scores[0].value as number) > 0)
})

test('the state a county multiplies as is struck in the states table', () => {
  // A party that scores an in-party contact by STATE has to say so in the states
  // checklist, or the operator reads it as still needed while the score already
  // counts it.
  const { sheet } = run([qso({ location: 'MAWOR', refType: NEQP.refType })], {
    params: NEQP,
    ourLocation: 'MABAR',
  })
  assert.equal(sheet.states.MA, 1)
  // Same for a party whose in-party entrants claim their own state on top of the
  // county.
  assert.equal(run([qso({ location: 'ERI' })]).sheet.states.NY, 1)
  // And a Canadian party's provinces land in the provinces table, not the states
  // one.
  const acqp = run([qso({ location: 'NSANP', entityPrefix: 'VE', refType: ACQP.refType })], {
    params: ACQP,
    ourLocation: 'NSCOL',
  })
  assert.equal(acqp.sheet.provinces.NS, 1)
  assert.deepEqual(acqp.sheet.states, {})
})

test('two out-of-party stations working each other is not a contest QSO', () => {
  const { scores } = run([qso({ location: 'CT' })], { ourLocation: 'NJ' })
  assert.equal(scores[0].value, 0)
})

test('a station with no exchange is scored under the county they gave last time', () => {
  // The second contact is on a different band, so it counts — and it counts as
  // Erie.
  const { scores, sheet } = run([
    qso({ location: 'ERI' }),
    qso({ band: '40m' }),
  ])
  assert.equal(scores[1].value, 2)
  assert.equal(sheet.counties.ERI, 2)
})

test('a repeat on the same band, mode and county is a duplicate', () => {
  const { scores, sheet } = run([qso({ location: 'ERI' }), qso({ location: 'ERI' })])
  assert.equal(scores[1].value, 0)
  assert.equal(scores[1].dupe, true)
  assert.deepEqual(scores[1].alerts, ['duplicate'])
  assert.equal(sheet.dupes, 1)
})

test('a county line that overlaps an earlier contact on ANY pairing is a repeat', () => {
  // The safe reading of a rule the sponsors leave open. Requiring every pairing
  // to overlap claims a contact a log checker may strike, and an over-claim in a
  // submitted file is the worse of the two errors — so a station who moves onto
  // a line that still includes the county we just worked them from gets no
  // second contact.
  const { scores } = run([qso({ location: 'ERI' }), qso({ location: 'ERI/CHA' })])
  assert.equal(scores[1].dupe, true)
  // Neither county worked before, and it counts — both pairings.
  const fresh = run([qso({ location: 'ERI' }), qso({ location: 'ALB/CHA' })])
  assert.equal(fresh.scores[1].value, 2 * 2)
})

test('the same station on a new band or a new mode counts again, and says so', () => {
  const { scores } = run([
    qso({ location: 'ERI' }),
    qso({ location: 'ERI', band: '40m' }),
    qso({ location: 'ERI', mode: 'SSB' }),
  ])
  assert.ok(scores[1].notices?.includes('newBand'))
  assert.ok(scores[2].notices?.includes('newMode'))
  assert.equal(scores[1].value, 2)
})

test('a rover who moves may work the same station again, from the new county', () => {
  // Rolling location: the second contact is scored against the segment's ref, so
  // the pair (our county, theirs) is new.
  const { scores } = run([qso({ location: 'ERI' }), qso({ location: 'ERI' })], {
    ourLocation: ['ALB', 'REN'],
  })
  assert.equal(scores[1].value, 2)
  assert.equal(scores[1].dupe, undefined)
})

test('a rover activates each county they operate from', () => {
  const { sheet } = run([qso({ location: 'ERI' }), qso({ location: 'CHA' })], {
    ourLocation: ['ALB', 'REN'],
  })
  assert.deepEqual(sheet.activatedCounties, { ALB: 1, REN: 1 })
})

test('a multiplier is claimed once, and the first claim says so', () => {
  const { scores, sheet } = run([
    qso({ location: 'ERI' }),
    qso({ call: 'K2DEF', location: 'ERI' }),
  ])
  assert.ok(scores[0].notices?.includes('newMult'))
  assert.ok(!(scores[1].notices ?? []).includes('newMult'))
  assert.equal(Object.keys(sheet.mults).length, 2) // ERI and NY
})

test("an in-party station's own state multiplies alongside the county", () => {
  const { sheet } = run([qso({ location: 'ERI' })])
  assert.deepEqual(Object.keys(sheet.mults).sort(), ['ERI', 'NY'])
  // An out-of-party entrant gets the county alone.
  const outside = run([qso({ location: 'ERI' })], { ourLocation: 'NJ' })
  assert.deepEqual(Object.keys(outside.sheet.mults), ['ERI'])
})

test('multipliers per band, per mode, or once — whichever the party publishes', () => {
  const args = { band: '20m', mode: 'CW', weAreInParty: true }
  assert.equal(multiplierPrefix(resolveParty(NY), args), '')
  assert.equal(multiplierPrefix(resolveParty(OH), args), 'CW:')
  assert.equal(multiplierPrefix(resolveParty(TN), args), '20m:')
  assert.equal(multiplierPrefix(resolveParty(SC), args), '20m:CW:')
})

test('the side-specific per-band options apply to the side they name', () => {
  // Testing the in-party option in every branch makes a party that sets it
  // unable to reach the plain per-band rule, and applies it to the other side.
  const nh = resolveParty(NH)
  assert.equal(multiplierPrefix(nh, { band: '20m', mode: 'CW', weAreInParty: false }), '20m:')
  assert.equal(multiplierPrefix(nh, { band: '20m', mode: 'CW', weAreInParty: true }), '')
})

test('a party may answer the multiplier key for itself', () => {
  const { sheet } = run([qso({ location: 'ERI' })], {
    params: { ...NY, multiplierKeyPrefix: () => 'DAY1:' },
  })
  assert.deepEqual(Object.keys(sheet.mults).sort(), ['DAY1:ERI', 'DAY1:NY'])
})

test('an in-party pair multiplies by state, and the county is still logged', () => {
  const { sheet } = run([qso({ location: 'MAWOR', refType: NEQP.refType })], {
    params: NEQP,
    ourLocation: 'MABAR',
  })
  assert.deepEqual(Object.keys(sheet.mults), ['MA'])
  assert.equal(sheet.counties.MAWOR, 1)
})

test('the same rule in a Canadian party multiplies by province', () => {
  // The county is always what was sent; only what it multiplies changes.
  const { sheet } = run([qso({ location: 'NSANP', entityPrefix: 'VE', refType: ACQP.refType })], {
    params: ACQP,
    ourLocation: 'NSCOL',
  })
  assert.equal(sheet.counties.NSANP, 1)
  assert.equal(Object.keys(sheet.mults).some((key) => key.includes('NSANP')), false)
})

test('an in-state station working out of state scores double where a party says so', () => {
  const inside = run([qso({ location: 'NC', refType: SC.refType })], { params: SC, ourLocation: 'ABBE' })
  const outside = run([qso({ location: 'ABBE', refType: SC.refType })], { params: SC, ourLocation: 'NC' })
  assert.equal(inside.scores[0].value, 4)
  assert.equal(outside.scores[0].value, 2)
})

test('a rare county multiplies the contact, and the sweep pays once', () => {
  const rare = ['CAB', 'GRM', 'VAN', 'MAC', 'DAV']
  const one = run([qso({ location: 'CAB', refType: NC.refType })], { params: NC, ourLocation: 'WAK' })
  assert.equal(one.scores[0].value, 3 * 10)
  assert.ok(one.scores[0].notices?.includes('rareCounty'))

  const swept = run(
    rare.map((location, index) => qso({ call: `K${index}AAA`, location, refType: NC.refType })),
    { params: NC, ourLocation: 'WAK' },
  )
  // `bonusPostMultiplier`: the sweep is added AFTER the multiplier, so it is not
  // multiplied by the county count.
  assert.equal(swept.summary().total, swept.sheet.points * multsOf(swept) + 500)
})

test('the bonus stations pay out-of-state entrants only, and sweep', () => {
  // An in-state factor of 0 is how a party says "not for us".
  const stations = ['K7S', 'K7P', 'K7U', 'K7D']
  const outside = run(
    stations.map((call) => qso({ call, location: 'ADA', refType: ID.refType })),
    { params: ID, ourLocation: 'WA' },
  )
  assert.equal(Object.values(outside.sheet.bonusStations).reduce((a, b) => a + b, 0), 400)
  assert.ok(outside.scores[0].notices?.includes('bonusStation'))
  // 400 for the four stations, plus the 100 sweep for working all of them.
  assert.equal(outside.summary().total, (outside.sheet.points + 500) * multsOf(outside))

  const inside = run([qso({ call: 'K7S', location: 'ADA', refType: ID.refType })], {
    params: ID,
    ourLocation: 'BOI',
  })
  assert.deepEqual(inside.sheet.bonusStations, {})
})

test('a bonus station pays once, and again per band where the party says so', () => {
  const wv = run([
    qso({ call: 'W8WVA', location: 'KAN', refType: WV.refType }),
    qso({ call: 'W8WVA', location: 'KAN', band: '40m', refType: WV.refType }),
  ], { params: WV, ourLocation: 'OH' })
  assert.equal(Object.keys(wv.sheet.bonuses).length, 2)
  assert.equal(wv.sheet.bonusStations.W8WVA, 200)
  // A party with no bonus stations pays none.
  assert.deepEqual(run([qso({ call: 'W8WVA', location: 'ERI' })]).sheet.bonusStations, {})
})

test('a bonus written with a slashed zero still matches the logged callsign', () => {
  // Hams write `WØMA` by hand and a log carries the digit, so the two would never
  // meet and the bonus could not be claimed at all.
  const { sheet } = run([qso({ call: 'W0MA', location: 'ERI' })], {
    params: { ...NY, bonusStations: { 'WØMA': 100 } },
  })
  assert.equal(sheet.bonusStations.W0MA, 100)
})

test('a bonus station is recognized by its base call, so a rover still pays', () => {
  const roving: Record<string, JSONValue> = {
    their: { call: 'W8WVA/M', baseCall: 'W8WVA', entityPrefix: 'K' },
    band: '20m',
    mode: 'CW',
    refs: [{ type: WV.refType, location: 'KAN' }],
  }
  const { sheet } = run([roving], { params: WV, ourLocation: 'OH' })
  assert.equal(sheet.bonusStations.W8WVA, 100)
})

test('a party may answer what a bonus station pays', () => {
  const params: QsoPartyParams = {
    ...NY,
    bonusStations: { W2XYZ: 100 },
    bonusForStation: ({ call, weAreInParty }) => (call.startsWith('K7') ? (weAreInParty ? 25 : 50) : undefined),
  }
  // The override is asked first, and is told which side we are on…
  assert.equal(run([qso({ call: 'K7ABC', location: 'ERI' })], { params }).sheet.bonusStations.K7ABC, 25)
  assert.equal(
    run([qso({ call: 'K7ABC', location: 'ERI' })], { params, ourLocation: 'NJ' }).sheet.bonusStations.K7ABC,
    50,
  )
  // …and `undefined` is "no opinion", which falls back to the party's own table.
  assert.equal(run([qso({ call: 'W2XYZ', location: 'ERI' })], { params }).sheet.bonusStations.W2XYZ, 100)
})

test('the per-county bonus is for rovers, and only above the minimum', () => {
  const fifteen = (location: string) =>
    Array.from({ length: 15 }, (_, index) => qso({ call: `K${index}AAA`, location, refType: CO.refType }))
  const bonusOf = (result: ReturnType<typeof run>) =>
    result.summary().total - result.sheet.points * multsOf(result)

  const rover = run(fifteen('DEN'), { params: CO, ourLocation: 'ADA', mobile: true })
  assert.equal(bonusOf(rover), 500)

  const fixed = run(fifteen('DEN'), { params: CO, ourLocation: 'ADA' })
  assert.equal(bonusOf(fixed), 0)

  // One QSO short of the minimum earns nothing.
  const short = run(fifteen('DEN').slice(0, 14), { params: CO, ourLocation: 'ADA', mobile: true })
  assert.equal(bonusOf(short), 0)
})

test('"Mobile or Rover" is the station class, and the old flag still counts', () => {
  // Declaring Mobile or Rover is the same claim the checkbox made, and has to
  // earn the same bonus — while an operation logged before the classes existed,
  // or synced from app-polo, still carries the boolean.
  const fifteen = Array.from({ length: 15 }, (_, index) =>
    qso({ call: `K${index}AAA`, location: 'DEN', refType: CO.refType }))
  const bonusOf = (result: ReturnType<typeof run>) =>
    result.summary().total - result.sheet.points * multsOf(result)

  assert.equal(bonusOf(run(fifteen, { params: CO, ourLocation: 'ADA', station: 'MOBILE' })), 500)
  assert.equal(bonusOf(run(fifteen, { params: CO, ourLocation: 'ADA', mobile: true })), 500)
  assert.equal(bonusOf(run(fifteen, { params: CO, ourLocation: 'ADA', station: 'FIXED' })), 0)
})

test('our own county is a multiplier without working anyone in it', () => {
  const { sheet } = run([qso({ location: 'MD', refType: NC.refType })], { params: NC, ourLocation: 'WAK' })
  assert.ok(Object.keys(sheet.mults).includes('WAK'))
  // And only for the parties that say so.
  assert.equal(Object.keys(run([qso({ location: 'MD' })]).sheet.mults).includes('ALB'), false)
})

test('a rover claims its own county only while it is roving', () => {
  const roving = run([qso({ location: 'MD', refType: TN.refType })], {
    params: TN,
    ourLocation: 'ANDE',
    station: 'ROVER',
  })
  assert.ok(Object.keys(roving.sheet.mults).includes('20m:ANDE'))
  const fixed = run([qso({ location: 'MD', refType: TN.refType })], { params: TN, ourLocation: 'ANDE' })
  assert.equal(Object.keys(fixed.sheet.mults).includes('20m:ANDE'), false)
})

test('the DX entity cap limits the multipliers instead of erasing them', () => {
  const entities = ['DL', 'F', 'G', 'I', 'EA', 'PA']
  const { sheet } = run(entities.map((prefix, index) => qso({
    call: `${prefix}1AA${index}`,
    location: 'DX',
    entityPrefix: prefix,
    refType: IL.refType,
  })), { params: IL, ourLocation: 'COOK' })
  const dxMults = Object.keys(sheet.mults).filter((key) => key.includes('DX:'))
  // The cap is five: the sixth entity is a valid contact worth points, and not a
  // sixth multiplier.
  assert.equal(dxMults.length, 5)
  assert.equal(Object.keys(sheet.entities).length, 6)

  // And a SECOND station in the over-cap entity does not sneak past it. The
  // exemption that keeps an established multiplier claimable has to test what was
  // CREDITED, not what was worked — testing the latter lets the sixth entity in
  // on its second contact, one multiplier over a published cap.
  const twice = run([...entities, 'PA', 'PA'].map((prefix, index) => qso({
    call: `${prefix}1AA${index}`,
    location: 'DX',
    entityPrefix: prefix,
    refType: IL.refType,
  })), { params: IL, ourLocation: 'COOK' })
  assert.equal(Object.keys(twice.sheet.mults).filter((key) => key.includes('DX:')).length, 5)
})

test('a party credits each DX entity up to its published cap', () => {
  const entities = ['DL', 'F', 'G', 'I', 'EA', 'PA', 'ON', 'SM', 'LA', 'OZ', 'SP', 'HA']
  const { sheet } = run(entities.map((prefix, index) => qso({
    call: `${prefix}1AA${index}`,
    location: 'DX',
    entityPrefix: prefix,
    refType: NH.refType,
  })), { params: NH, ourLocation: 'BEL' })
  const dxMults = Object.keys(sheet.mults).filter((key) => key.includes('DX:'))
  assert.equal(dxMults.length, 10, 'ten credited, not one and not twelve')
  assert.equal(Object.keys(sheet.entities).length, 12, 'all twelve worked')
})

test('a declared power class multiplies the score, and no claim multiplies by one', () => {
  const qrp = run([qso({ location: 'NJ', refType: DE.refType })], {
    params: DE,
    ourLocation: 'NDE',
    power: 'QRP',
  })
  const undeclared = run([qso({ location: 'NJ', refType: DE.refType })], { params: DE, ourLocation: 'NDE' })
  assert.equal(qrp.summary().total, undeclared.summary().total * 3)
})

test('a power class the party does not publish is not submitted under it', () => {
  // A class left behind by an earlier setup must be refused, as it is on every
  // other axis: a party without power classes cannot inherit the answer.
  const ref = { type: WI.refType, power: 'QRP' }
  assert.equal(ourPowerClass(resolveParty(WI), undefined, ref), 'QRP')
  assert.equal(ourPowerClass(resolveParty(NV), undefined, ref), undefined)
})

test("a party prices a contact by which side the other station is on", () => {
  // "2 points per QSO with ME stations, 1 point per QSO with non-ME stations" —
  // the published rule no per-mode points table can express.
  const inParty = run([qso({ location: 'CBL', refType: ME.refType })], { params: ME, ourLocation: 'NH' })
  assert.equal(inParty.scores[0].value, 2)
  const outOfParty = run([qso({ location: 'NH', refType: ME.refType })], { params: ME, ourLocation: 'CBL' })
  assert.equal(outOfParty.scores[0].value, 1)
})

test('a party may price a contact for itself, one pairing at a time', () => {
  const params: QsoPartyParams = {
    ...NY,
    pointsForContact: ({ theirs }) => (theirs.some((location) => location.code === 'ERI') ? 10 : undefined),
  }
  // The price is per PAIRING, so a county line pays it twice.
  assert.equal(run([qso({ location: 'ERI' })], { params }).scores[0].value, 10)
  assert.equal(run([qso({ location: 'ERI/CHA' })], { params }).scores[0].value, 20)
  // `undefined` is "no opinion", and the mode table answers.
  assert.equal(run([qso({ location: 'CHA' })], { params }).scores[0].value, 2)
})

test("a day's total is that day's points against the running multiplier", () => {
  const result = run([qso({ location: 'ERI' }), qso({ call: 'K2DEF', location: 'CHA' })])
  assert.equal(result.summary('day').total, result.sheet.dayPoints * multsOf(result))
  assert.equal(result.summary('operation').total, result.sheet.points * multsOf(result))
})

test('the summary lists what is still out there, not just what is done', () => {
  const { summary } = run([qso({ location: 'ERI' })])
  const detail = summary().longSummary as string
  // Worked counties are struck through; the rest are there to be chased.
  assert.match(detail, /\*\*~~ERI~~\*\*/)
  assert.match(detail, /\bALL\b/)
  assert.equal(summary().grid, true)
})

test('typing your STATE where your county belongs is said out loud', () => {
  // `NY` resolves cleanly to the state — no party's county codes collide with a
  // state code — so nothing else objects, and the whole log is quietly scored
  // under out-of-party rules: no own-state multiplier, no activated county, a
  // different multiplier key. The contact still counts; the operator is told.
  const typed = run([qso({ location: 'ERI' })], { ourLocation: 'NY' })
  assert.deepEqual(typed.scores[0].alerts, ['ourLocation'])
  assert.ok((typed.scores[0].value as number) > 0, 'the contact still counts for what it is worth')

  // A county is what it should be, and says nothing.
  assert.equal(run([qso({ location: 'ERI' })], { ourLocation: 'ALB' }).scores[0].alerts, undefined)
  // And a genuine out-of-party entrant is not nagged about their own state.
  assert.equal(run([qso({ location: 'ERI' })], { ourLocation: 'NJ' }).scores[0].alerts, undefined)
  // A multi-state party knows every one of its own states, and it has no
  // `state` field to have learnt them from: they come from the county codes.
  assert.deepEqual(
    run([qso({ location: 'ORDES', refType: SEVEN_QP.refType })], {
      params: SEVEN_QP,
      ourLocation: 'UT',
    }).scores[0].alerts,
    ['ourLocation'],
  )
})

test('a party may say which state a county belongs to', () => {
  // Codes that carry no state of their own: without an answer here every one of
  // them belongs to the party's lead state, and an entrant in the second state
  // is never told they typed a state for a county.
  const params: QsoPartyParams = {
    ...NY,
    state: 'OR',
    counties: { DES: 'Deschutes', ADA: 'Ada' },
    stateOfCounty: (county) => (county === 'ADA' ? 'ID' : undefined),
  }
  assert.deepEqual(
    run([qso({ location: 'DES' })], { params, ourLocation: 'ID' }).scores[0].alerts,
    ['ourLocation'],
  )
})

test('a DX station is resolved from the callsign when nothing else knows', () => {
  // An imported or synced QSO carries no lookup at all, so without the country
  // file the entity is unknown: the exchange resolves to nothing, the contact
  // scores `missingExchange`, and the DX multiplier the party publishes is never
  // claimed.
  registerEntityLookup((call) => (call?.toUpperCase().startsWith('DL') ? 'DL' : undefined))
  try {
    const imported = {
      their: { call: 'DL1ABC' },
      band: '20m',
      mode: 'CW',
      refs: [{ type: IL.refType, location: '' }],
    } as Record<string, JSONValue>
    const { scores, sheet } = run([imported], { params: IL, ourLocation: 'COOK' })
    assert.ok((scores[0].value as number) > 0)
    assert.deepEqual(Object.keys(sheet.entities), ['DL'])
  } finally {
    registerEntityLookup(() => undefined)
  }
})
