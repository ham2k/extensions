// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Whose reference a ref is decides everything downstream: the scorer's scope
// hands this extension every legacy state-parks operation, and only `isOurRef`
// stands between Florida's rules and a Texas log.

import { test } from "node:test"
import assert from "node:assert/strict"

import { eventRefIn, isOurRef, ourParks, theirParks } from "./parks.ts"

test("ours is our own type, or the combined extension's ref naming Florida", () => {
  assert.equal(isOurRef({ type: 'flspota' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'FLSP' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'flsp' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'TXSP' }), false)
  assert.equal(isOurRef({ type: 'stateparks' }), false)
  assert.equal(isOurRef({ type: 'txspota' }), false)
  assert.equal(isOurRef(undefined), false)
})

test("our own type wins where an operation carries both", () => {
  const own = { type: 'flspota' }
  assert.equal(eventRefIn({ refs: [{ type: 'stateparks', ref: 'FLSP' }, own] }), own)
  assert.equal(eventRefIn({ refs: [{ type: 'stateparks', ref: 'OHSP' }] }), undefined)
})

test("only a listed park is one of ours; every POTA park is one of theirs", () => {
  const operation = { refs: [{ type: 'potaActivation', ref: 'us-0634' }, { type: 'potaActivation', ref: 'US-5579' }] }
  assert.deepEqual(ourParks(operation), ['US-0634'])
  const qso = { refs: [{ type: 'pota', ref: 'US-5579' }, { type: 'pota', ref: 'US-0635' }, { type: 'pota', ref: 'US-0635' }] }
  assert.deepEqual(theirParks(qso), ['US-5579', 'US-0635'])
})

test("each side reads its OWN ref type", () => {
  assert.deepEqual(ourParks({ refs: [{ type: 'pota', ref: 'US-0634' }] }), [])
  assert.deepEqual(theirParks({ refs: [{ type: 'potaActivation', ref: 'US-0634' }] }), [])
})
