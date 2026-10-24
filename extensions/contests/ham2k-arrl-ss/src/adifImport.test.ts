// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Dedicated ADIF fields and the whole exchange are independent sources.
// Their conflicts must preserve the dedicated field, including an explicit
// blank; malformed input must stay available for the operator to correct.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { Ref } from "@ham2k/extension-sdk"

import { SSAdifImportHook } from "./adifImport.ts"

const ctx = { online: false, locale: 'en' } as never

async function importOne(fields: Record<string, string>): Promise<Ref | undefined> {
  const results = await SSAdifImportHook.refsForRecords({ records: [{ fields }] }, ctx)
  assert.equal(results.length, 1)
  return results[0]?.refs?.[0]
}

const dedicated = { stx: '001', srx: '043', precedence: ' m ', check: '00', arrl_sect: ' il ' }

test("recovers dedicated Sweepstakes fields for both weekends and the unconfigured export ID", async () => {
  for (const contest_id of ['ARRL-SS-CW', 'ARRL-SS-SSB', ' arrl-ss ']) {
    assert.deepEqual(await importOne({ contest_id, ...dedicated }), {
      type: 'arrl-ss', ref: '', ourSerial: '001', theirSerial: '043', theirPrecedence: 'M', theirCheck: '00', theirSection: 'IL',
    })
  }
})

test("declines absent, unrelated and similar contest IDs even with a complete exchange", async () => {
  for (const contest_id of ['', 'ARRL-FD', 'ARRL-SS-CW-OTHER', 'CQ-WPX-CW']) {
    assert.equal(await importOne({ contest_id, ...dedicated }), undefined)
  }
  assert.equal(await importOne(dedicated), undefined)
})

test("a known contest keeps only the fields the record actually supplies", async () => {
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', check: '07' }), {
    type: 'arrl-ss', ref: '', theirCheck: '07',
  })
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW' }), { type: 'arrl-ss', ref: '' })
})

test("reads the four-part exchange strings this extension exports", async () => {
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', stx_string: ' 001 A 79 CT ', srx_string: '043 m 00 il' }), {
    type: 'arrl-ss', ref: '', ourSerial: '001', theirSerial: '043', theirPrecedence: 'M', theirCheck: '00', theirSection: 'IL',
  })
})

test("reads a full five-part exchange only when its callsign agrees with the record", async () => {
  assert.deepEqual(await importOne({
    contest_id: 'ARRL-SS-SSB', station_callsign: 'n0dev', call: 'w1aw',
    stx_string: '1 A N0DEV 79 CT', srx_string: '43 M W1AW 00 IL',
  }), {
    type: 'arrl-ss', ref: '', ourSerial: '1', theirSerial: '43', theirPrecedence: 'M', theirCheck: '00', theirSection: 'IL',
  })
  const callFields: Record<string, string>[] = [
    { call: 'K1ABC', station_callsign: 'N0DEV' },
    { call: 'W1AW', station_callsign: 'K1ABC' },
    {},
  ]
  for (const fields of callFields) {
    const ref = await importOne({ contest_id: 'ARRL-SS-CW', stx_string: '1 A N0DEV 79 CT', srx_string: '43 M W1AW 00 IL', ...fields })
    assert.equal(ref?.ourSerial, fields.station_callsign === 'N0DEV' ? '1' : undefined)
    assert.equal(ref?.theirSerial, fields.call === 'W1AW' ? '43' : undefined)
  }
})

test("dedicated fields win independently over a conflicting string", async () => {
  assert.deepEqual(await importOne({
    contest_id: 'ARRL-SS-CW', ...dedicated,
    stx_string: '999 Q 92 MI', srx_string: '888 A 79 CT',
  }), {
    type: 'arrl-ss', ref: '', ourSerial: '001', theirSerial: '043', theirPrecedence: 'M', theirCheck: '00', theirSection: 'IL',
  })
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', check: '07', srx_string: '43 M 00 IL' }), {
    type: 'arrl-ss', ref: '', theirSerial: '43', theirPrecedence: 'M', theirCheck: '07', theirSection: 'IL',
  })
})

test("explicit empty dedicated fields suppress every string fallback", async () => {
  assert.deepEqual(await importOne({
    contest_id: 'ARRL-SS-CW', stx: '', srx: '', precedence: '', check: '', arrl_sect: '',
    stx_string: '1 A 79 CT', srx_string: '43 M 00 IL',
  }), {
    type: 'arrl-ss', ref: '', ourSerial: '', theirSerial: '', theirPrecedence: '', theirCheck: '', theirSection: '',
  })
})

test("malformed dedicated fields survive without replacement or invented corrections", async () => {
  assert.deepEqual(await importOne({
    contest_id: 'ARRL-SS-CW', stx: 'not a number', srx: '-1', precedence: 'unknown', check: '1979', arrl_sect: 'YT',
    stx_string: '1 A 79 CT', srx_string: '43 M 00 IL',
  }), {
    type: 'arrl-ss', ref: '', ourSerial: 'not a number', theirSerial: '-1', theirPrecedence: 'unknown', theirCheck: '1979', theirSection: 'YT',
  })
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', precedence: ' ? ', check: '7', arrl_sect: 'Province name' }), {
    type: 'arrl-ss', ref: '', theirPrecedence: ' ? ', theirCheck: '7', theirSection: 'Province name',
  })
})

test("a complete string with invalid exchange values remains available for correction", async () => {
  assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', srx_string: '43 X 7 ILL' }), {
    type: 'arrl-ss', ref: '', theirSerial: '43', theirPrecedence: 'X', theirCheck: '7', theirSection: 'ILL',
  })
})

test("does not shift partial, reordered, or free-text exchange strings into fields", async () => {
  for (const srx_string of ['43 M IL', 'W1AW 43 M 00 IL', '43 W1AW 00 IL', 'not a valid exchange', '43 M 00 IL extra', '43 M ? IL']) {
    assert.deepEqual(await importOne({ contest_id: 'ARRL-SS-CW', call: 'W1AW', srx_string }), { type: 'arrl-ss', ref: '' }, srx_string)
  }
})

test("returns positional results and never hoists or guesses operation setup", async () => {
  const records: { fields: Record<string, string> }[] = [
    { fields: { contest_id: 'CQ-WPX-CW', ...dedicated } },
    { fields: { contest_id: 'ARRL-SS-CW', stx_string: '1 U 79 CT', srx_string: '43 A 00 IL' } },
    { fields: {} },
    { fields: { contest_id: 'ARRL-SS-SSB', srx_string: '2 M 07 TER' } },
  ]
  assert.deepEqual(await SSAdifImportHook.refsForRecords({ records }, ctx), [
    null,
    { refs: [{ type: 'arrl-ss', ref: '', ourSerial: '1', theirSerial: '43', theirPrecedence: 'A', theirCheck: '00', theirSection: 'IL' }] },
    null,
    { refs: [{ type: 'arrl-ss', ref: '', theirSerial: '2', theirPrecedence: 'M', theirCheck: '07', theirSection: 'TER' }] },
  ])
  assert.deepEqual(await SSAdifImportHook.refsForRecords({ records: [] }, ctx), [])
})
