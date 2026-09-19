// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// "Is this a Wisconsin park" is the whole of what makes a multiplier, and it is
// answered from two sources that fail in opposite directions: POTA's `location`
// is missing on a ref logged offline, and the snapshot is missing a park POTA
// added after it was taken. Each test here is one source standing in for the
// other.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { JSONValue } from "@ham2k/extension-sdk"

import { isWisconsinPark, ourPark, theirPark } from "./parks.ts"

// Havenwoods State Forest — the rules' own example, and in the snapshot.
const HAVENWOODS = 'US-5579'
// A reference no snapshot can hold.
const NOT_LISTED = 'US-99999'

test("an undecorated ref counts by the snapshot alone", () => {
  // Drop the snapshot fallback and a park logged offline scores as no park.
  assert.equal(isWisconsinPark({ type: 'pota', ref: HAVENWOODS }), true)
  assert.equal(isWisconsinPark({ type: 'pota', ref: 'us-5579' }), true)
})

test("a park the snapshot has never heard of counts by POTA's location", () => {
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED, location: 'US-WI' }), true)
})

test("a park on the state line is a Wisconsin park", () => {
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED, location: 'US-MN,US-WI' }), true)
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED, location: 'US-MN, US-WI' }), true)
})

test("out-of-state parks are not — they 'do not earn a multiplier'", () => {
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED, location: 'US-MN' }), false)
  // Whole areas, not substrings: a location merely CONTAINING the letters.
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED, location: 'US-WIX' }), false)
  assert.equal(isWisconsinPark({ type: 'pota', ref: NOT_LISTED }), false)
})

test("POTA's location outvotes the snapshot", () => {
  // The snapshot is the older of the two, and exists for a ref with NO
  // location. Read as "either is enough", a park POTA has since moved out of
  // Wisconsin would stay a multiplier for as long as this bundle is installed.
  assert.equal(isWisconsinPark({ type: 'pota', ref: HAVENWOODS, location: 'US-MN' }), false)
  assert.equal(isWisconsinPark({ type: 'pota', ref: HAVENWOODS, location: '' }), true)
})

test("a POTA two-fer is ONE park a side", () => {
  // "You may operate in only one park at a time": two references at one spot
  // must not become two multipliers.
  const operation = { refs: [{ type: 'potaActivation', ref: 'US-4238' }, { type: 'potaActivation', ref: HAVENWOODS }] }
  assert.equal(ourPark(operation), 'US-4238')
  const qso: Record<string, JSONValue> = { refs: [{ type: 'pota', ref: NOT_LISTED, location: 'US-IL' }, { type: 'pota', ref: HAVENWOODS }] }
  assert.equal(theirPark(qso), HAVENWOODS)
})

test("each side reads its OWN ref type", () => {
  // A hunted park on the operation, or an activation on a QSO, is not ours to
  // read: swapping the two types would credit our own park as worked.
  assert.equal(ourPark({ refs: [{ type: 'pota', ref: HAVENWOODS }] }), '')
  assert.equal(theirPark({ refs: [{ type: 'potaActivation', ref: HAVENWOODS }] }), '')
  assert.equal(ourPark(undefined), '')
})
