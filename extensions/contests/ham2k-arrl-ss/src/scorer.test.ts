// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Sweepstakes scoring is simple arithmetic — two points a contact, times the
// sections — wrapped in three rules that are easy to get quietly wrong: once
// per contest rather than per band, W/VE only, and only the first 24 hours of
// operating time. These encode each.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { JSONValue } from "@ham2k/extension-sdk"

import { SSScorer, fmtDuration, scoringHook } from "./scorer.ts"
import { loadHistory, parseHistory, removeHistory } from "./history.ts"

const ctx = { online: false, locale: 'en' } as never
const operation = { uuid: 'op', stationCall: 'N0DEV' }
const cwRef = { type: 'arrl-ss', mode: 'CW' }

const START = Date.UTC(2026, 10, 7, 21, 0)
const MINUTE = 60 * 1000

function qso(call: string, minutes: number, section = 'CT', band = '20m', mode = 'CW'): Record<string, JSONValue> {
  return {
    their: { call },
    band,
    mode,
    startAtMillis: START + minutes * MINUTE,
    refs: [{ type: 'arrl-ss', theirSerial: '1', theirPrecedence: 'A', theirCheck: '79', theirSection: section }],
  }
}

function run(qsos: Record<string, JSONValue>[], ref: Record<string, JSONValue> = cwRef) {
  let sheet = SSScorer.startScoresheet({ operation, ref }, ctx)
  const scores = qsos.map((q) => {
    const r = SSScorer.scoreQso({ scoresheet: sheet, qso: q, operation, ref, isNewDay: false }, ctx)
    sheet = r.scoresheet
    return r.score
  })
  const summary = SSScorer.summarizeScore({ scoresheet: sheet, operation, ref, scope: 'operation' }, ctx)['arrl-ss']
  return { sheet, scores, summary }
}

test("two points a contact, times the sections worked", () => {
  const { scores, summary } = run([qso('W1AW', 0, 'CT'), qso('K1ABC', 1, 'CT'), qso('W9JJ', 2, 'IL')])
  assert.deepEqual(scores.map((s) => s.value), [2, 2, 2])
  // 6 points × 2 sections.
  assert.equal(summary.total, 12)
  assert.deepEqual(scores.map((s) => s.notices ?? []), [['newMult'], [], ['newMult']])
})

test("a station counts once per contest, whatever the band, and W1AW/7 is W1AW", () => {
  const { scores, sheet } = run([qso('W1AW', 0), qso('W1AW', 5, 'CT', '40m'), qso('W1AW/7', 10)])
  assert.deepEqual(scores.map((s) => s.value), [2, 0, 0])
  assert.equal(scores[1].dupe, true)
  assert.equal(scores[2].dupe, true)
  // A counted contact says so, so core's per-band dupe rule stands down.
  assert.equal(scores[0].dupe, false)
  assert.equal(sheet.qsos, 1)
})

test("only W/VE stations count, the possessions included", () => {
  const { scores } = run([qso('DL1ABC', 0), qso('KH6ABC', 1, 'PAC'), qso('KP4ABC', 2, 'PR'), qso('VE3ABC', 3, 'ONS'), qso('KL7ABC', 4, 'AK')])
  assert.deepEqual(scores.map((s) => s.value), [0, 2, 2, 2, 2])
  assert.deepEqual(scores[0].alerts, ['invalidCategory'])
})

test("WARC bands and the other weekend's mode don't count", () => {
  const { scores } = run([qso('W1AW', 0, 'CT', '30m'), qso('K1ABC', 1, 'CT', '20m', 'SSB')])
  assert.deepEqual(scores.map((s) => s.alerts), [['invalidBand'], ['invalidMode']])
  // Phone is any voice mode.
  const phone = run([qso('W1AW', 0, 'CT', '20m', 'USB'), qso('K1ABC', 1, 'CT', '2m', 'FM'), qso('K2ABC', 2, 'CT', '10m', 'FM')], { type: 'arrl-ss', mode: 'SSB' })
  assert.deepEqual(phone.scores.map((s) => s.value), [2, 0, 2])
})

test("a section the list doesn't know scores the contact but no multiplier, and says so", () => {
  const { scores, summary } = run([qso('W1AW', 0, 'XX'), qso('K1ABC', 1, 'ct')])
  assert.deepEqual(scores.map((s) => s.value), [2, 2])
  // Lowercase is still CT; XX is nothing.
  assert.equal(summary.mults, 1)
  assert.deepEqual(scores.map((s) => s.alerts), [['invalidExchange'], undefined])
})

test("an exchange with a part missing or not one Sweepstakes sends is flagged while it can be fixed", () => {
  const withExchange = (call: string, minutes: number, exchange: Record<string, JSONValue>) => {
    const q = qso(call, minutes)
    const refs = q.refs as Record<string, JSONValue>[]
    q.refs = [{ ...refs[0], ...exchange }]
    return q
  }
  const { scores } = run([
    withExchange('W1AW', 0, { theirCheck: '' }),
    withExchange('K1ABC', 1, { theirSection: undefined as never }),
    withExchange('K2ABC', 2, { theirPrecedence: 'X' }),
    withExchange('K3ABC', 3, { theirCheck: '7' }),
    withExchange('K4ABC', 4, { theirSerial: '1A' }),
  ])
  // A part not copied is held back by its field, where Enter sends the
  // operator; one copied wrong is logged, with the pill.
  assert.deepEqual(scores.map((s) => s.incomplete), [['arrl-ss/theirCheck'], ['arrl-ss/theirSection'], undefined, undefined, undefined])
  assert.deepEqual(scores.map((s) => s.alerts), [undefined, undefined, ['invalidExchange'], ['invalidExchange'], ['invalidExchange']])
  // Still scored: the log checker, not the logger, decides what a bad copy costs.
  assert.deepEqual(scores.map((s) => s.value), [2, 2, 2, 2, 2])
})

test("a gap of 30 minutes or more is an off-time; anything shorter is operating time", () => {
  const { sheet, summary } = run([qso('W1AW', 0), qso('K1ABC', 29), qso('K2ABC', 59), qso('K3ABC', 89)])
  // 0 → 29 operating, 29 → 59 is exactly 30 minutes off, 59 → 89 off again.
  assert.equal(sheet.operatedMillis, 29 * MINUTE)
  assert.equal(sheet.offTimes.length, 2)
  assert.match(String(summary.longSummary), /Operating time:\*\* 0h 29m of 24h — 23h 31m left/)
  assert.match(String(summary.longSummary), /Off times:\*\* 2129Z–2159Z \(0h 30m\), 2159Z–2229Z \(0h 30m\)/)
})

test("contacts past 24 hours of operating time score nothing, but the clock leaves out the off-times", () => {
  // A contact every 20 minutes — all operating time — with one two-hour
  // break in the middle that does not count against the 24.
  const qsos: Record<string, JSONValue>[] = []
  let minute = 0
  for (let i = 0; i < 80; i++) {
    qsos.push(qso(`K${i}AA`, minute))
    minute += i === 30 ? 120 : 20
  }
  const { scores, sheet, summary } = run(qsos)
  // 72 gaps of 20 minutes make 24 hours exactly. The break is one of the 73
  // gaps before index 73, so that contact is at hour 24 — still in — and
  // every one after it is past.
  assert.equal(scores[73].value, 2)
  assert.equal(scores[74].value, 0)
  assert.deepEqual(scores[74].alerts, ['overTime'])
  // Editing a contact from before the limit, scored against the whole log,
  // is not over time; one after it still is.
  const edit = (index: number) => SSScorer.scoreQso({ scoresheet: structuredClone(sheet), qso: { ...qsos[index], their: { call: 'W9JJ' } }, operation, ref: cwRef, isNewDay: false }, ctx).score
  assert.equal(edit(5).value, 2)
  assert.equal(edit(73).value, 2)
  assert.deepEqual(edit(75).alerts, ['overTime'])
  assert.equal(sheet.overtime, 80 - 74)
  assert.equal(sheet.qsos, 74)
  assert.match(String(summary.longSummary), /all 24h 00m used/)
  assert.match(String(summary.longSummary), /6 contacts past the 24 hours/)

  const one = run(qsos.slice(0, 75))
  assert.match(String(one.summary.longSummary), /\*\*1 contact past the 24 hours\*\* doesn't count/)
})

test("the operating time leads the summary, ahead of sections and bands", () => {
  const { summary } = run([qso('W1AW', 0)])
  const detail = String(summary.longSummary).split('\n\n')
  // The arithmetic line, then the clock.
  assert.match(detail[0], /1 QSO/)
  assert.match(detail[1], /^\*\*Operating time/)
  assert.match(detail[2], /^### Sections: 1 of 85/)
})

test("the sections are a checklist, a row per call area, those worked struck through", async () => {
  const { ALL_SECTIONS } = await import("./sections.ts")
  const all = Object.keys(ALL_SECTIONS)
  const { summary } = run([qso('W1AW', 0, 'CT'), qso('VE3ABC', 1, 'ONS'), qso('K6ABC', 2, 'SDG')])
  assert.equal(summary.grid, true)
  const detail = String(summary.longSummary)
  assert.match(detail, /### Sections: 3 of 85\n/)
  assert.match(detail, /^W1 \*\*~~CT~~\*\* EMA ME NH RI VT WMA$/m)
  assert.match(detail, /^W6 EB LAX ORG PAC SB SCV \*\*~~SDG~~\*\* SF SJV SV$/m)
  assert.match(detail, /^VE AB BC GH MB NB NL NS ONE ONN \*\*~~ONS~~\*\* PE QC SK TER$/m)
  // Every section in exactly one row: the rows hold all 85 and nothing else.
  const rows = detail.split('\n').filter((line) => /^(W\d|VE) /.test(line))
  assert.equal(rows.length, 11)
  assert.deepEqual(rows.flatMap((row) => row.split(' ').slice(1).map((code) => code.replace(/[*~]/g, ''))).sort(), [...all].sort())

  const sweep = run(all.map((section, i) => qso(`K${i}AA`, i, section)))
  assert.match(String(sweep.summary.longSummary), /### Clean Sweep! All 85 sections/)
  const sweptCodes = String(sweep.summary.longSummary).split('\n').filter((line) => /^(W\d|VE) /.test(line)).flatMap((row) => row.split(' ').slice(1))
  assert.equal(sweptCodes.length, 85)
  assert.ok(sweptCodes.every((code) => /^\*\*~~[A-Z]+~~\*\*$/.test(code)))
  assert.equal(sweep.summary.total, 85 * 2 * 85)
})

test("a band line carries its points and the sections first worked there, adding up to the total", () => {
  // CT is worked on 20m and again on 40m. Counted on both bands, the band
  // lines would claim three sections where the score multiplies by two.
  const { summary } = run([qso('W1AW', 0, 'CT', '20m'), qso('K1ABC', 1, 'CT', '40m'), qso('W9JJ', 2, 'IL', '40m')])
  const detail = String(summary.longSummary)
  assert.match(detail, /^\*\*40m\*\*: 2 QSOs, 4 pts, 1 section$/m)
  assert.match(detail, /^\*\*20m\*\*: 1 QSO, 2 pts, 1 section$/m)
  assert.match(detail, /^\*\*160m\*\*: —$/m)
})

test("the short summary is the sections and the score, and a day has none", () => {
  const { summary } = run([qso('W1AW', 0, 'CT'), qso('K1ABC', 1, 'CT'), qso('W9JJ', 2, 'IL')])
  assert.equal(summary.summary, '×2: 12')
  let sheet = SSScorer.startScoresheet({ operation, ref: cwRef }, ctx)
  sheet = SSScorer.scoreQso({ scoresheet: sheet, qso: qso('W1AW', 0), operation, ref: cwRef, isNewDay: false }, ctx).scoresheet
  assert.deepEqual(SSScorer.summarizeScore({ scoresheet: sheet, operation, ref: cwRef, scope: 'day' }, ctx), {})
})

test("durations read as hours and minutes", () => {
  assert.equal(fmtDuration(0), '0h 00m')
  assert.equal(fmtDuration(18 * 3600000 + 5 * 60000 + 59000), '18h 05m')
})

test("a spot or a call not yet copied is a new section by the section it is likely in, which scores nothing", async (t) => {
  t.after(() => removeHistory('CW'))
  loadHistory('CW', parseHistory('!!Order!!,Call,Sect,CK\nW9JJ,IL,79\nK9AB,WI,80\nK2LE,ENY,72\n'))
  const log = [{ ...qso('W1XX', 0, 'IL'), uuid: 'logged-1' }]
  const scoring = scoringHook()
  const logCtx = { ...(ctx as object), getQsos: async () => log } as never
  const spot = (call: string, their: Record<string, JSONValue> = {}) => ({ their: { call, ...their }, band: '20m', mode: 'CW', refs: [] })
  const verdicts = (await scoring.scoreCandidates!(
    {
      operation,
      ref: cwRef,
      candidates: [
        // Sections from the history file: IL is worked, WI is not.
        { key: 'il', qso: spot('W9JJ') },
        { key: 'wi', qso: spot('K9AB') },
        // Not in the file: the call info's section, then a state that is one.
        { key: 'named', qso: spot('N0ABC', { arrlSection: 'co' }) },
        { key: 'guessed', qso: spot('N0ABD', { guess: { arrlSection: 'IL' } }) },
        { key: 'state', qso: spot('N0ABE', { guess: { state: 'OH' } }) },
        // The section the call names, where it stays and no state is known:
        // a KH6 call whose lookup puts it in California is no PAC.
        { key: 'prefix', qso: spot('KL7ABC') },
        { key: 'entity', qso: spot('NP4ABC') },
        { key: 'away', qso: spot('KL7ABD/6') },
        { key: 'moved', qso: spot('KH6ABC', { guess: { state: 'CA' } }) },
        // Nothing to go on, a split state, and a station already worked.
        { key: 'unknown', qso: spot('N0ABF') },
        { key: 'split', qso: spot('N0ABG', { guess: { state: 'CA' } }) },
        { key: 'worked', qso: spot('W1XX') },
      ],
    } as never,
    logCtx,
  )) as Record<string, { notices: string[]; dupe?: boolean }>
  const flagged = Object.entries(verdicts).filter(([, v]) => v.notices.includes('newMult')).map(([key]) => key)
  assert.deepEqual(flagged, ['wi', 'named', 'state', 'prefix', 'entity'])
  assert.equal(verdicts.worked.dupe, true)

  // Once a section is copied, it decides: ENY copied for a station the file
  // puts in WI is a new section, and IL copied is not.
  const copied = (section: string) => ({ ...spot('K9AB'), refs: [{ type: 'arrl-ss', theirSection: section }] })
  const live = (q: Record<string, JSONValue>) => scoring.scoreQso!({ operation, ref: cwRef, qso: q } as never, logCtx) as Promise<{ notices: string[] }>
  assert.deepEqual((await live(spot('K9AB'))).notices, ['newMult'])
  assert.deepEqual((await live(copied('IL'))).notices, [])
  // Until the section is copied the likely one stands, whatever else is in:
  // a serial typed, or a check the app prefilled from the history file, which
  // gives a portable call its check and not its home section.
  assert.deepEqual((await live({ ...spot('K9AB'), refs: [{ type: 'arrl-ss', theirSerial: '12', theirPrecedence: 'A' }] })).notices, ['newMult'])
  const portable = { ...spot('K2LE/9', { guess: { state: 'OH' } }), refs: [{ type: 'arrl-ss', theirCheck: '72' }] }
  assert.deepEqual((await live(portable)).notices, ['newMult'])
  // A section still being typed keeps it while it could still be WI, and a
  // start that is no WI, or a section that is none, drops it.
  assert.deepEqual((await live(copied('W'))).notices, ['newMult'])
  assert.deepEqual((await live(copied('E'))).notices, [])
  assert.deepEqual((await live(copied('XX'))).notices, [])

  // A contact logged with nothing of its exchange gets no inferred notice, and
  // the section it is likely in is no multiplier.
  const logged = await scoring.scoreQsos({ operation, ref: cwRef, qsos: [...log, { ...spot('K9AB'), uuid: 'logged-2', startAtMillis: START + MINUTE }] } as never, ctx)
  assert.equal(logged.qsoScores['logged-2'].notices, undefined)
  assert.equal(logged.qsoScores['logged-2'].inferred, undefined)
  assert.equal(logged.qsoScores['logged-2'].value, 2)
  assert.equal((logged.operationSummary['arrl-ss'] as { mults?: number }).mults, 1)
})

// The spot keys pass over a spot worth 0 points. A DX station is one; a W/VE
// station whose exchange is still to come is not, and every spot is that.
test("a spot outside the contest is worth 0 to the spot keys, and one awaiting its exchange keeps its points", async () => {
  const scoring = scoringHook()
  const logCtx = { ...(ctx as object), getQsos: async () => [] } as never
  const spot = (call: string, band = '20m') => ({ their: { call }, band, mode: 'CW', refs: [] })
  const verdicts = (await scoring.scoreCandidates!(
    { operation, ref: cwRef, candidates: [{ key: 'dx', qso: spot('DL1ABC') }, { key: 'warc', qso: spot('W9JJ', '30m') }, { key: 'wve', qso: spot('K9AB') }] },
    logCtx,
  )) as Record<string, { value?: number }>
  assert.equal(verdicts.dx.value, 0)
  assert.equal(verdicts.warc.value, 0)
  assert.equal(verdicts.wve.value, 2)
})

test("the scorer the app runs answers only the calls scoringHook accounts for", () => {
  // scoringHook drops inferred notices from scoreQsos alone; the other two
  // pass no marker on. A call the SDK adds would get the raw verdicts.
  assert.deepEqual(Object.keys(scoringHook()).sort(), ['scope', 'scoreCandidates', 'scoreQso', 'scoreQsos'])
})
