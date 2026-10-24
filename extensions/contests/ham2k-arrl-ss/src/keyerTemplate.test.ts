// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The documented preset is the source of truth: render the copyable code
// block itself so the example cannot drift from a separate test fixture.

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

import { renderTemplate, templateContext } from "@ham2k/extension-sdk"
import type { JSONValue } from "@ham2k/extension-sdk"

import type { EntryClass } from "./entry.ts"

const documentation = await readFile(new URL('../docs/keyer.md', import.meta.url), 'utf8')
const block = documentation.match(/```liquid\r?\n([\s\S]*?)\r?\n```/)
assert.ok(block, 'the keyer guide must contain its copyable Liquid preset')
const template = block[1]

const PRECEDENCES = {
  'SO-QRP': 'Q', 'SO-LOW': 'A', 'SO-HIGH': 'B',
  'SOU-QRP': 'U', 'SOU-LOW': 'U', 'SOU-HIGH': 'U',
  'MULTI-LOW': 'M', 'MULTI-HIGH': 'M', SCHOOL: 'S',
} satisfies Record<EntryClass, string>

function context({
  setup = {},
  operation = {},
  refs = [{ type: 'arrl-ss', ourSerial: 9, theirSerial: '123' }],
}: {
  setup?: Record<string, JSONValue>
  operation?: Record<string, JSONValue>
  refs?: Record<string, JSONValue>[]
} = {}) {
  return templateContext({
    operation: {
      uuid: 'keyer-operation',
      stationCall: 'N1RWJ',
      refs: [
        { type: 'potaActivation', ref: 'US-0001' },
        { type: 'arrl-ss', mode: 'CW', entry: 'SO-LOW', check: '00', section: 'ENY', ...setup },
      ],
      ...operation,
    },
    qso: { their: { call: 'W1AW' }, refs },
  })
}

for (const [entry, precedence] of Object.entries(PRECEDENCES)) {
  test(`the documented preset sends the full ${entry} exchange in order, keeping check 00`, () => {
    assert.equal(renderTemplate(template, context({ setup: { entry } })), `9 ${precedence} N1RWJ 00 ENY`)
  })
}

test('resending reads the same draft serial without changing the context', () => {
  const draft = context()
  const before = structuredClone(draft)
  assert.equal(renderTemplate(template, draft), '9 A N1RWJ 00 ENY')
  assert.equal(renderTemplate(template, draft), '9 A N1RWJ 00 ENY')
  assert.deepEqual(draft, before)
  // The host supplies the next contact's serial; the template only reads it.
  assert.equal(renderTemplate(template, context({ refs: [{ type: 'arrl-ss', ourSerial: 10 }] })), '10 A N1RWJ 00 ENY')
})

test('a manually corrected serial is used exactly as supplied', () => {
  assert.equal(renderTemplate(template, context({ refs: [{ type: 'arrl-ss', ourSerial: '0042' }] })), '0042 A N1RWJ 00 ENY')
})

test('the documented padding and cuts change only the serial', () => {
  for (const [expression, expected] of [
    ['{{ qso.serialSent | pad: 3 }}', '009 A N1RWJ 00 ENY'],
    ['{{ qso.serialSent | pad: 3 | cut }}', 'TTN A N1RWJ 00 ENY'],
  ]) {
    assert.ok(documentation.includes(expression), `the guide must explain ${expression}`)
    const formatted = template.replace('{{ qso.serialSent }}', expression)
    assert.equal(renderTemplate(formatted, context()), expected)
    assert.equal(renderTemplate(formatted, context({ refs: [{ type: 'arrl-ss', ourSerial: 1234 }] })), '1234 A N1RWJ 00 ENY')
    assert.equal(renderTemplate(formatted, context({ refs: [] })), '')
  }
})

test('no sent serial means no message, including when a received serial exists', () => {
  for (const refs of [
    [],
    [{ type: 'arrl-ss', theirSerial: '123' }],
    [{ type: 'arrl-ss', ourSerial: '' }],
    [{ type: 'arrl-ss', ourSerial: '   ' }],
  ]) {
    assert.equal(renderTemplate(template, context({ refs })), '')
  }
})

test('missing or blank setup and an unrecognized category produce no message', () => {
  for (const key of ['entry', 'check', 'section', 'mode']) {
    assert.equal(renderTemplate(template, context({ setup: { [key]: '' } })), '', `blank ${key}`)
  }
  assert.equal(renderTemplate(template, context({ setup: { entry: 'UNKNOWN' } })), '')
  assert.equal(renderTemplate(template, context({ setup: { check: '  ' } })), '')
  assert.equal(renderTemplate(template, context({ setup: { section: '  ' } })), '')
  assert.equal(renderTemplate(template, context({ operation: { stationCall: '' } })), '')
  assert.equal(renderTemplate(template, context({ operation: { stationCall: '  ' } })), '')
  assert.equal(renderTemplate(template, context({ operation: { refs: [] } })), '')
  assert.equal(renderTemplate(template, context({ operation: { refs: [{ type: 'arrl-ss' }] } })), '')
})

test('the CW preset stays empty in a Phone operation', () => {
  assert.equal(renderTemplate(template, context({ setup: { mode: 'SSB' } })), '')
})

test('setup text is trimmed and callsign and section are uppercased', () => {
  assert.equal(renderTemplate(template, context({
    setup: { entry: ' so-low ', check: ' 00 ', section: ' eny ' },
    operation: { stationCall: ' n1rwj ' },
  })), '9 A N1RWJ 00 ENY')
})
