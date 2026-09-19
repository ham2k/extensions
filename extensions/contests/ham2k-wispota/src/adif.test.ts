// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The file is what the sponsor checks the operator's three counts against, so
// every test here is one way the file and the score could come to disagree.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { JSONValue } from "@ham2k/extension-sdk"

import { adifFieldsFor } from "./adif.ts"
import { ourPark, theirPark } from "./parks.ts"

const HAVENWOODS = 'US-5579'
const ICE_AGE_TRAIL = 'US-4238'

function valueOf(fields: { name: string; value: string }[], name: string): string | undefined {
  return fields.find((field) => field.name === name)?.value
}

test("a station at a POTA two-fer is ONE set of fields, naming the park that was scored", () => {
  // POTA's own hook answers this contact with a field set per reference, which
  // the exporter writes as two records: two QSOs in the file, one on the panel.
  const qso: Record<string, JSONValue> = {
    refs: [{ type: 'pota', ref: ICE_AGE_TRAIL }, { type: 'pota', ref: HAVENWOODS }],
  }
  const fields = adifFieldsFor('WIPOTA', qso, { refs: [] })
  assert.equal(fields.filter((field) => field.name === 'SIG_INFO').length, 1)
  assert.equal(valueOf(fields, 'SIG_INFO'), theirPark(qso))
})

test("our park in the file is the WISCONSIN one, not merely the first listed", () => {
  // An n-fer whose first reference is out of state: the score credits the WI
  // park, so a file naming the other claims a park the score never counted.
  const operation: Record<string, JSONValue> = {
    refs: [{ type: 'potaActivation', ref: 'US-2466', location: 'US-MN' }, { type: 'potaActivation', ref: HAVENWOODS }],
  }
  const fields = adifFieldsFor('WIPOTA', {}, operation)
  assert.equal(valueOf(fields, 'MY_SIG_INFO'), HAVENWOODS)
  assert.equal(valueOf(fields, 'MY_SIG_INFO'), ourPark(operation))
})

test("an out-of-state park is not in the file: SIG_INFO is for a WI park only", () => {
  const qso: Record<string, JSONValue> = { refs: [{ type: 'pota', ref: 'US-2466', location: 'US-MN' }] }
  const fields = adifFieldsFor('WIPOTA', qso, { refs: [] })
  assert.deepEqual(fields, [{ name: 'CONTEST_ID', value: 'WIPOTA' }])
})

test("each pair is answered whole", () => {
  // The exporter picks a winner per field NAME: half a pair takes the name
  // from another program and orphans that program's reference.
  const fields = adifFieldsFor(
    'WIPOTA',
    { refs: [{ type: 'pota', ref: HAVENWOODS }] },
    { refs: [{ type: 'potaActivation', ref: ICE_AGE_TRAIL }] },
  )
  assert.deepEqual(fields.map((field) => field.name), ['CONTEST_ID', 'MY_SIG', 'MY_SIG_INFO', 'SIG', 'SIG_INFO'])
  assert.equal(valueOf(fields, 'MY_SIG'), 'POTA')
  assert.equal(valueOf(fields, 'SIG'), 'POTA')
})
