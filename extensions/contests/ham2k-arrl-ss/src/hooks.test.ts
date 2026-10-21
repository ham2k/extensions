// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The activity, ref and logging hooks, the way the app calls them.

import { test } from "node:test"
import assert from "node:assert/strict"

import { fixtureOperation, loadExtension } from "./sdkGapTesting.ts"

const contest = await loadExtension(() => import("./index.ts"), { hostCalls: { getSettings: () => ({ operatorSection: 'eny' }) } })

type Suggestion = { mode?: string; name: string; label: string; shortLabel: string; relevance: number }
type FormElement = {
  type: string
  key?: string
  value?: unknown
  options?: { value: string; label: string }[]
  suggestions?: { code: string; name?: string }[]
  text?: string
}
type Control = { key: string; input: Record<string, unknown> & { form?: { elements: FormElement[] } } }

const configured = fixtureOperation({
  stationCall: 'N0DEV',
  refs: [{ type: 'arrl-ss', mode: 'CW', entry: 'SO-LOW', check: '79', section: 'CT' }],
})

test("the activity search offers both weekends, the nearest first, dated and labelled as the operation will show them", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 20) })
  const suggestions = (await contest.runHook("activity", "suggest", { searchTerm: "sweep" })) as Suggestion[]
  const ranked = [...suggestions].sort((a, b) => b.relevance - a.relevance).map((s) => s.mode)
  assert.deepEqual(ranked, ["CW", "SSB"])

  const dates = Object.fromEntries(suggestions.map((s) => [s.mode, s.name.split(" • ")[1]]))
  assert.deepEqual(dates, { CW: "2026-11-07", SSB: "2026-11-21" })

  // A label that differs from decorateRef's would change the moment the
  // operation is edited.
  for (const s of suggestions) {
    const decorated = (await contest.runHook("ref:arrl-ss", "decorateRef", { ref: { type: "arrl-ss", mode: s.mode } })) as Suggestion
    assert.equal(s.label, decorated.label)
    assert.equal(s.shortLabel, decorated.shortLabel)
  }
  assert.deepEqual(suggestions.map((s) => s.label), ["ARRL SS CW", "ARRL SS Phone"])
})

test("an operation already running the contest is offered nothing, and unrelated searches find nothing", async () => {
  assert.deepEqual(await contest.runHook("activity", "suggest", { operation: configured, searchTerm: "ss" }), [])
  assert.deepEqual(await contest.runHook("activity", "suggest", { searchTerm: "pota" }), [])
})

test("explicit mode searches offer only that weekend while general searches keep both", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 20) })
  for (const searchTerm of ['CW', 'ss cw', 'Sweepstakes CW', 'CW Sweepstakes', 'Morse code']) {
    const suggestions = await contest.runHook('activity', 'suggest', { searchTerm }) as Suggestion[]
    assert.deepEqual(suggestions.map((s) => s.mode), ['CW'], searchTerm)
  }
  for (const searchTerm of ['Phone', 'SSB', 'SS Phone', 'Sweepstakes SSB', 'Phone Sweepstakes', 'voice']) {
    const suggestions = await contest.runHook('activity', 'suggest', { searchTerm }) as Suggestion[]
    assert.deepEqual(suggestions.map((s) => s.mode), ['SSB'], searchTerm)
  }
  for (const searchTerm of ['', 'ARRL', 'SS', 'Sweepstakes', 'November Sweepstakes']) {
    const suggestions = await contest.runHook('activity', 'suggest', { searchTerm }) as Suggestion[]
    assert.deepEqual(suggestions.map((s) => s.mode), ['CW', 'SSB'], searchTerm)
  }
})

test("the setup seeds our section from the profile", async () => {
  const controls = (await contest.runHook("activity", "operationControls", { operation: fixtureOperation() })) as Control[]
  const elements = controls[0].input.form!.elements
  assert.deepEqual(elements.filter((e) => e.type === 'field').map((e) => e.key), ['mode', 'entry', 'check', 'section', 'operators', 'club'])
  assert.equal(elements.find((e) => e.key === 'section')!.value, 'ENY')
})

test("setup explains the two modes and separate operations in both languages", async () => {
  for (const [locale, labels, help] of [
    ['en', ['CW', 'Phone'], /separate operation for each/],
    ['es', ['CW', 'Fonía'], /operación para cada uno/],
  ] as const) {
    const controls = await contest.runHook('activity', 'operationControls', { operation: fixtureOperation() }, { ctx: { locale } }) as Control[]
    const elements = controls[0].input.form!.elements
    assert.deepEqual(elements.find((e) => e.key === 'mode')!.options, [
      { value: 'CW', label: labels[0] }, { value: 'SSB', label: labels[1] },
    ])
    assert.match(elements.find((e) => e.type === 'markdown')!.text!, help)
  }
})

test("our section setup offers the same named codes as the received section field", async () => {
  const setup = await contest.runHook('activity', 'operationControls', { operation: configured }) as Control[]
  const section = setup[0].input.form!.elements.find((e) => e.key === 'section')!
  const logging = await contest.runHook('activity', 'loggingControls', { operation: configured }) as Control[]
  assert.deepEqual(section.suggestions, logging.find((c) => c.key === 'arrl-ss/theirSection')!.input.options)
  assert.equal(section.suggestions!.length, 85)
  assert.ok(section.suggestions!.some((s) => s.code === 'TER' && s.name === 'Territories'))
  assert.ok(!section.suggestions!.some((s) => ['YT', 'DX', 'MX'].includes(s.code)))
})

test("export option labels identify the configured contest mode", async () => {
  for (const [mode, label] of [['CW', 'ARRL SS CW'], ['SSB', 'ARRL SS Phone'], ['', 'ARRL SS']]) {
    const operation = fixtureOperation({ refs: [{ type: 'arrl-ss', mode }] })
    const options = await contest.runHook('export', 'suggestExportOptions', { operation }) as { label: string }[]
    assert.deepEqual(options.map((o) => o.label), [`ADIF for ${label}`, `Cabrillo for ${label}`])
  }
  assert.deepEqual(await contest.runHook('export', 'suggestExportOptions', { operation: fixtureOperation() }), [])
})

test("the operation shows the exchange we send", async () => {
  const decorated = (await contest.runHook("ref:arrl-ss", "decorateRef", { ref: configured.refs![0 as never] })) as { name: string; label: string }
  assert.equal(decorated.label, 'ARRL SS CW')
  assert.equal(decorated.name, 'A 79 CT')
  const title = (await contest.runHook("ref:arrl-ss", "suggestOperationTitle", { ref: { type: 'arrl-ss', mode: 'SSB', entry: 'MULTI-HIGH', check: '31', section: 'ENY' }, operation: configured })) as { for: string; subtitle: string }
  assert.deepEqual(title, { for: 'ARRL SS Phone', subtitle: 'M 31 ENY' })
})

test("logging asks for our serial, then theirs, precedence, check and section, in the order they are sent", async () => {
  const controls = (await contest.runHook("activity", "loggingControls", {
    operation: configured,
    qso: { their: { call: 'W1AW', state: 'CT' } },
  })) as Control[]
  assert.deepEqual(controls.map((c) => c.key), [
    'arrl-ss/ourSerial', 'arrl-ss/theirSerial', 'arrl-ss/theirPrecedence', 'arrl-ss/theirCheck', 'arrl-ss/theirSection',
  ])
  assert.equal(controls[0].input.kind, 'serial')
  assert.deepEqual(controls[4].input.preferredCodes, ['CT'])
  // Off-contest, nothing.
  assert.deepEqual(await contest.runHook("activity", "loggingControls", { operation: fixtureOperation() }), [])
})

test("saving projects both exchanges where the QSO row and plain ADIF can see them", async () => {
  const patch = await contest.runHook("activity", "processQsoBeforeSave", {
    operation: configured,
    qso: { their: { call: 'W9JJ' }, refs: [{ type: 'arrl-ss', ourSerial: 123, theirSerial: '043', theirPrecedence: 'm', theirCheck: '31', theirSection: 'il' }] },
  })
  assert.deepEqual(patch, { our: { exchange: '123 A 79 CT' }, their: { exchange: '43 M 31 IL' } })

  // Nothing of theirs entered yet: only ours projects.
  const ours = await contest.runHook("activity", "processQsoBeforeSave", {
    operation: configured,
    qso: { their: { call: 'W9JJ' }, refs: [{ type: 'arrl-ss', ourSerial: 7 }] },
  })
  assert.deepEqual(ours, { our: { exchange: '7 A 79 CT' } })
})

test("a part that isn't a valid value is kept as typed, so the exchange never looks complete when it isn't", async () => {
  const patch = await contest.runHook("activity", "processQsoBeforeSave", {
    operation: fixtureOperation({ refs: [{ type: 'arrl-ss', mode: 'CW', entry: 'SO-LOW', check: '1979', section: 'NYC' }] }),
    qso: { their: { call: 'W9JJ' }, refs: [{ type: 'arrl-ss', ourSerial: 1, theirSerial: '43', theirPrecedence: 'x', theirCheck: '7', theirSection: 'ill' }] },
  })
  assert.deepEqual(patch, { our: { exchange: '1 A 1979 NYC' }, their: { exchange: '43 X 7 ILL' } })
})

test("an unknown section is flagged in the entry field rather than accepted", async () => {
  const controls = (await contest.runHook("activity", "loggingControls", { operation: configured, qso: { their: { call: 'W1AW' } } })) as Control[]
  assert.notEqual(controls[4].input.allowFreeform, true)
})
