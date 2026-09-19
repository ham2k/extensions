// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT
//
// The date gate through the `suggest` HOOK, with the clock parked on a chosen
// day. schedule.test.ts proves the arithmetic; this proves the hook applies it
// to the right asks. Two traps: a hook that skips the gate heads the nearby
// list six days a week, and a hook that ignores `scoped` answers the
// extension's own "Activity Types" row with nothing on those same six days —
// both asks arrive with no search term, so `scoped` is the only thing telling
// them apart.

import { test } from "node:test"
import assert from "node:assert/strict"
import { hooks, host } from '@ham2k/extension-sdk'
import type { ExportResult, JSONValue, LoggingControlDescriptor } from '@ham2k/extension-sdk'
import { fixtureOperation, fixtureQso, loadExtension } from './sdkGapTesting.ts'

type Qson = Record<string, JSONValue>
type AdifField = { name: string; value: string }

const cwt = await loadExtension(() => import('./index.ts'), {
  hostCalls: { fetch: () => { throw new Error('Logging must not fetch call-history data') } },
})
// Monday 24 August 2026, and the Wednesday of that week — a CWT day.
const MONDAY_NOON = Date.UTC(2026, 7, 24, 12)
const WEDNESDAY = (hour: number, minute = 0) => Date.UTC(2026, 7, 26, hour, minute)

interface Suggestion {
  type: string
  ref: string
  shortLabel: string
  relevance: number
}

const suggest = async (args: Record<string, unknown> = {}) =>
  (await cwt.runHook("activity", "suggest", { operation: fixtureOperation(), ...args })) as Suggestion[]

test("offers nothing unprompted on a day with no session", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: MONDAY_NOON })
  assert.deepEqual(await suggest(), [])
})

test("offers nothing unprompted more than three hours before a session", async (t) => {
  // A CWT day, but the 1300 is still four hours out.
  t.mock.timers.enable({ apis: ["Date"], now: WEDNESDAY(9) })
  assert.deepEqual(await suggest(), [])
})

test("offers exactly the session at hand once its lead window opens", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: WEDNESDAY(10, 30) })
  const suggestions = await suggest()
  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].type, "cwt")
  assert.equal(suggestions[0].ref, "2026-08-26-1300")
  assert.equal(suggestions[0].shortLabel, "CWT 1300z")
})

test("a scoped ask is answered on a day the nearby list stays silent", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: MONDAY_NOON })
  assert.deepEqual(await suggest(), [])

  const scoped = await suggest({ scoped: true })
  assert.equal(scoped.length, 4, "a scope offers the next four sessions on any day")

  // The picker ranks these on `relevance` alone, so the order emitted has to
  // already be the order they run in — and a Monday's next session is
  // Wednesday's 1300.
  const refs = scoped.map((s) => s.ref)
  assert.equal(new Set(refs).size, 4)
  assert.deepEqual(refs, [...refs].sort())
  assert.deepEqual(refs, ["2026-08-26-1300", "2026-08-26-1900", "2026-08-27-0300", "2026-08-27-0700"])
})

test("a non-member's state or province fills their State; a member number, or a DX prefix that spells a state, does not", async () => {
  const operation = fixtureOperation({ stationCall: "N0DEV", refs: [{ type: "cwt", ref: "CWT-1300" }] })
  const save = async (number: string, call = "W1AW", dxccCode = 291) =>
    ((await cwt.runHook("activity", "processQsoBeforeSave", {
      operation,
      qso: { their: { call, guess: { dxccCode } }, refs: [{ type: "cwt", name: "hiram", number }] },
    })) as { their?: Record<string, unknown> } | null)?.their

  assert.deepEqual(await save("ct"), { exchange: "HIRAM CT", state: "CT" })
  assert.deepEqual(await save("1234"), { exchange: "HIRAM 1234" })
  // A DX non-member sends its prefix, and the Czech Republic's is not Oklahoma.
  assert.deepEqual(await save("OK", "OK1RR", 503), { exchange: "HIRAM OK" })
})

const operation = fixtureOperation({
  refs: [{ type: 'cwt', ref: '2026-09-16-1300', ourName: 'Seb', ourNumber: '1234', power: 'LP' }],
})
const snapshot = await cwt.runHook('dataFile', 'rawToJSONData', {
  body: '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Al,4567\nK2ABC,Bob,CWA\nK3ABC,Carl,PA\n',
  url: 'https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS_TEST.txt',
})
// Clear runtime state before replaying the snapshot, as on a later app launch.
await cwt.runHook('dataFile', 'onRemoveRawData')
await cwt.runHook('dataFile', 'onLoadRawData', snapshot)

function qso(call: string): Qson {
  return fixtureQso({
    uuid: `new-${call}`, their: { call, sent: '599' }, our: { call: 'KI2D', sent: '599' },
    mode: 'CW', freq: 14030, startAtMillis: Date.UTC(2026, 8, 16, 13, 5),
  })
}

function object(value: JSONValue | undefined): Qson {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function save(draft: Qson): Promise<Qson> {
  const patch = await cwt.runHook('activity', 'processQsoBeforeSave', { operation, qso: draft }) as Qson | null
  // HaLo merges the fields on the owned ref. These fixtures have one CWT ref.
  const ref = Array.isArray(draft.refs) ? object(draft.refs[0]) : {}
  const refPatch = Array.isArray(patch?.refs) ? object(patch.refs[0]) : {}
  return {
    ...draft,
    ...patch,
    refs: [{ ...ref, ...refPatch }],
    their: { ...object(draft.their), ...object(patch?.their) },
  }
}

async function adifFields(saved: Qson): Promise<AdifField[]> {
  return await cwt.runHook('adifFields', 'fieldsForOneQSO', { operation, qso: saved }) as AdifField[]
}

async function cabrillo(saved: Qson): Promise<ExportResult> {
  return await cwt.runHook('export', 'generateExport', {
    operation, qsos: [saved], exportType: 'cwt-cabrillo',
  }) as ExportResult
}

for (const [call, name, number, fromHistory] of [
  ['K1ABC', 'AL', '4567', true], ['K2ABC', 'BOB', 'CWA', true], ['K3ABC', 'CARL', 'PA', true],
  ['W9ZZZ', 'HELMUT', 'WI', false], ['DL1ABC', 'HELMUT', 'DL', false],
] as const) {
  test(`${call}: logging controls → saved exchange → ADIF and Cabrillo`, async () => {
    const draft = qso(call)
    draft.their = { ...object(draft.their), guess: { name: 'Helmut', ...(call === 'DL1ABC' ? {} : { state: 'wi' }) } }
    const controls = await cwt.runHook('activity', 'loggingControls', {
      operation, qso: draft,
    }) as LoggingControlDescriptor[]
    // The host stores accepted suggestions on the CWT ref. Native touched-field
    // behavior belongs to the app; this test checks the extension's boundaries.
    const nameInput = controls.find((control) => control.key === 'cwt/name')?.input
    const numberInput = controls.find((control) => control.key === 'cwt/number')?.input
    assert.ok(nameInput?.kind === 'text')
    assert.ok(numberInput?.kind === 'text')
    assert.equal(nameInput.suggestedValue, name)
    assert.equal(numberInput.suggestedValue?.trim() ?? '', fromHistory ? number : '')
    if (!fromHistory) assert.equal(numberInput.placeholder, number)
    // The directory location only becomes part of the exchange if the operator enters it.
    const saved = await save({ ...draft, refs: [{ type: 'cwt', name, number }] })
    assert.equal(object(saved.their).exchange, `${name} ${number}`)
    assert.deepEqual(await adifFields(saved), [
      { name: 'CONTEST_ID', value: 'CWOPS-CWT' },
      { name: 'STX_STRING', value: 'SEB 1234' },
      { name: 'SRX_STRING', value: `${name} ${number}` },
    ])
    const exported = await cabrillo(saved)
    assert.match(exported.content, /CONTEST: CWOPS-CWT\n/)
    assert.match(exported.content, /CATEGORY-POWER: LOW\n/)
    assert.ok(exported.content.includes(`QSO: 14030 CW 2026-09-16 1305 KI2D 599 SEB 1234 ${call} 599 ${name} ${number}\n`))
    assert.ok(exported.filename.includes('CWT-2026-09-16-1300'))
  })
}

test('operator corrections and deliberate blanks take precedence on save and export', async () => {
  for (const name of ['allen', '']) {
    const saved = await save({
      ...qso('K1ABC'),
      their: { call: 'K1ABC', exchange: 'AL 4567', guess: { name: 'Al' } },
      refs: [{ type: 'cwt', name, number: '' }],
    })
    assert.deepEqual(saved.refs, [{ type: 'cwt', name: name.toUpperCase(), number: '' }])
    assert.equal(object(saved.their).exchange, name.toUpperCase())
    const received = (await adifFields(saved)).find((field) => field.name === 'SRX_STRING')
    assert.equal(received?.value, name ? 'ALLEN' : undefined)
    assert.ok((await cabrillo(saved)).content.includes(`K1ABC 599 ${name ? 'ALLEN' : '-'}\n`))
  }
})

test('manual exchange values, including clearing, survive the location fallback on save', async () => {
  for (const number of ['', '9999']) {
    const draft = {
      ...qso('W9ZZZ'),
      their: { call: 'W9ZZZ', guess: { state: 'WI' } },
      refs: [{ type: 'cwt', name: 'ROB', number }],
    }
    const controls = await cwt.runHook('activity', 'loggingControls', { operation, qso: draft }) as LoggingControlDescriptor[]
    const input = controls.find((control) => control.key === 'cwt/number')?.input
    assert.ok(input?.kind === 'text')
    assert.equal(input.placeholder, 'WI')
    assert.equal(input.suggestedValue?.trim() ?? '', '')
    // Native touched controls retain the operator value instead of applying
    // this suggestion. Verify the save hook does not guess over that value.
    const saved = await save(draft)
    assert.equal(object(saved.their).exchange, number ? 'ROB 9999' : 'ROB')
    assert.equal((await adifFields(saved)).find((field) => field.name === 'SRX_STRING')?.value, number ? 'ROB 9999' : 'ROB')
  }
})

test('ADIF delegates to the host using the official CWT handler', async (t) => {
  const invoke = t.mock.method(hooks, 'invokeOne', async () => [{
    key: 'adif', ok: true, value: { content: '<eoh>\n<eor>' },
  }])
  const result = await cwt.runHook('export', 'generateExport', {
    operation, qsos: [], exportType: 'cwt-adif',
  }) as ExportResult
  assert.equal(result.content, '<eoh>\n<eor>')
  assert.equal(invoke.mock.callCount(), 1)
  const [category, key, method, args] = invoke.mock.calls[0].arguments
  assert.deepEqual([category, key, method], ['export', 'adif', 'generateExport'])
  assert.partialDeepStrictEqual(args, { exportType: 'adif', mainHandler: 'ham2k-cwt' })
})

test('the registered prefill stays scoped to CWT and preserves scoring', async () => {
  assert.deepEqual(await cwt.runHook('activity', 'loggingControls', { operation: {}, qso: qso('K1ABC') }), [])
  assert.deepEqual(await cwt.runHook('lookup', 'lookupCall', {
    operation: {}, qso: {}, callInfo: { call: 'K1ABC' },
  }), [])
  const result = await cwt.runHook('scoring', 'scoreQsos', {
    operation,
    qsos: [qso('K1ABC'), qso('K2ABC'), { ...qso('K1ABC'), uuid: 'second-band', band: '40m' }],
  }) as { operationSummary: Record<string, { points: number; mults: number; total: number }> }
  assert.partialDeepStrictEqual(result.operationSummary.cwt, { points: 3, mults: 2, total: 6 })
})


test('CWT exposes a default call-history filter without fetching reports', async (t) => {
  const fetched = t.mock.method(host, 'fetch', async () => { throw new Error('No network expected') })
  for (const locale of ['en', 'es']) {
    const descriptor = await cwt.runHook('spotCallFilter:v1', 'describe', {}, { ctx: { locale } })
    assert.partialDeepStrictEqual(descriptor, { version: 1, available: true, defaultSelected: true })
    assert.ok(!JSON.stringify(descriptor).includes('{{'))
  }
  assert.deepEqual(await cwt.runHook('spotCallFilter:v1', 'matchCalls', {
    version: 1, calls: ['K1ABC/P', 'W9NEW'],
  }), { version: 1, available: true, calls: ['K1ABC/P'] })
  await cwt.runHook('dataFile', 'onRemoveRawData', {})
  assert.partialDeepStrictEqual(await cwt.runHook('spotCallFilter:v1', 'matchCalls', {
    version: 1, calls: ['K1ABC'],
  }), { available: false, calls: [] })
  t.mock.method(host, 'getSettings', async () => ({ extensions: { 'extension_ham2k-cwt': { spotsHistoryOnly: false } } }))
  assert.partialDeepStrictEqual(await cwt.runHook('spotCallFilter:v1', 'describe', {}), { defaultSelected: false })
  assert.equal(fetched.mock.callCount(), 0)
})
