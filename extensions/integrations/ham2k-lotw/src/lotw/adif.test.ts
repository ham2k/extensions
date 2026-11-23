// Copyright © 2026 Robert Jackson
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readTransferAdif } from './adif.ts'

const unreadable = 'Could not read the prepared LoTW contact.'

test('reads field lengths, normalized names, optional types and empty values', () => {
  assert.deepEqual(readTransferAdif(' \n<call:4:S>W1AW\n<BAND:3>20m<MY_STATE:0><eOr> \n'), {
    CALL: 'W1AW',
    BAND: '20m',
    MY_STATE: '',
  })
})

test('consumes Unicode values by the UTF-8 byte counts used by the host', () => {
  assert.deepEqual(readTransferAdif('<COMMENT:15><EOR>café!📻 <QTH:6>東京 <CALL:4>W1AW <EOR>'), {
    COMMENT: '<EOR>café!📻',
    QTH: '東京',
    CALL: 'W1AW',
  })
})

for (const input of [
  '',
  ' \n',
  '<EOR>',
  'header<CALL:4>W1AW<EOR>',
  '<EOH><CALL:4>W1AW<EOR>',
  '<CALL:4>W1AW',
  '<CALL:4>W1AW trailing<EOR>',
  '<CALL:4>W1AW<EOR>trailing',
  '<CALL:4>W1AW<EOR><CALL:4>W1AW<EOR>',
  '<CALL:4>W1AW<call:4>W1AW<EOR>',
  '<CALL:-1>W1AW<EOR>',
  '<CALL:4.0>W1AW<EOR>',
  '<CALL:>W1AW<EOR>',
  '<CALL:9007199254740992>W1AW<EOR>',
  '<CALL:5>W1AW',
  '<COMMENT:4>café<CALL:4>W1AW<EOR>',
  '<CALL:4',
  '<CALL:4:STRING>W1AW<EOR>',
  '<_CALL:4>W1AW<EOR>',
]) {
  test(`refuses malformed or ambiguous prepared input: ${input}`, () => {
    assert.throws(() => readTransferAdif(input), { message: unreadable })
  })
}

test('bounds the prepared record and field count', () => {
  const field = (value: string) => `<COMMENT:${value.length}>${value}<EOR>`
  assert.throws(() => readTransferAdif(field('x'.repeat(64 * 1024))))
  const fields = Array.from({ length: 256 }, (_, index) => `<F${index}:1>x`).join('')
  assert.equal(Object.keys(readTransferAdif(`${fields}<EOR>`)).length, 256)
  assert.throws(() => readTransferAdif(`${fields}<OVER:1>x<EOR>`))
})

test('does not include malformed input in its diagnostic', () => {
  assert.throws(() => readTransferAdif('<CALL:4>W1AWsecret-credential'), {
    message: /^Could not read the prepared LoTW contact\.$/,
  })
})
