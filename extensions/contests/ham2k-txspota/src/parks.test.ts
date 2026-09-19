// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Whose reference a ref is decides everything downstream: the scorer's scope
// hands this extension every legacy state-parks operation, and only `isOurRef`
// stands between Texas's rules and a Florida log.

import { test } from "node:test"
import assert from "node:assert/strict"

import { eventRefIn, isOurRef, ourParks, theirParks } from "./parks.ts"

test("ours is our own type, or the combined extension's ref naming Texas", () => {
  assert.equal(isOurRef({ type: 'txspota' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'TXSP' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'txsp' }), true)
  assert.equal(isOurRef({ type: 'stateparks', ref: 'FLSP' }), false)
  assert.equal(isOurRef({ type: 'stateparks' }), false)
  assert.equal(isOurRef({ type: 'flspota' }), false)
  assert.equal(isOurRef(undefined), false)
})

test("our own type wins where an operation carries both", () => {
  const own = { type: 'txspota' }
  assert.equal(eventRefIn({ refs: [{ type: 'stateparks', ref: 'TXSP' }, own] }), own)
  assert.equal(eventRefIn({ refs: [{ type: 'stateparks', ref: 'OHSP' }] }), undefined)
})

test("only a listed park is one of ours; every POTA park is one of theirs", () => {
  const operation = { refs: [{ type: 'potaActivation', ref: 'us-2983' }, { type: 'potaActivation', ref: 'US-5579' }] }
  assert.deepEqual(ourParks(operation), ['US-2983'])
  const qso = { refs: [{ type: 'pota', ref: 'US-5579' }, { type: 'pota', ref: 'US-2984' }, { type: 'pota', ref: 'US-2984' }] }
  assert.deepEqual(theirParks(qso), ['US-5579', 'US-2984'])
})

test("each side reads its OWN ref type", () => {
  assert.deepEqual(ourParks({ refs: [{ type: 'pota', ref: 'US-2983' }] }), [])
  assert.deepEqual(theirParks({ refs: [{ type: 'potaActivation', ref: 'US-2983' }] }), [])
})
