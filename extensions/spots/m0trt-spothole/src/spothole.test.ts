// Copyright ©️ 2026 Ian Renton
// SPDX-License-Identifier: MIT
//
// Test that Spothole records get properly converted into board spots, and the store that
// holds them between polls works.

import { test } from "node:test"
import assert from "node:assert/strict"

import { MAX_AGE_MILLIS, parseSpots, spotFromSpothole, SpotStore, spotsUrl } from "./spothole.ts"
import type { SpotholeSpot } from "./spothole.ts"

const NOW_S = 1794154057

function record(overrides: Partial<SpotholeSpot> = {}): SpotholeSpot {
  return {
    dx_call: "N0CALL",
    de_call: "M0TRT",
    freq: 14064500.0,
    mode: "CW",
    time: NOW_S - 2,
    received_time: NOW_S + 0.683644,
    comment: "RBN 10 dB 20 WPM via M0TRT-#",
    activities: ["POTA"],
    activity_refs: [{ activity: "POTA", id: "GB-0001", name: "Null Country Park" }],
    qrt: false,
    source: "POTA",
    ...overrides,
  }
}

test("a POTA spot becomes a board spot with a POTA ref, frequency in kHz and timestamp in millis", () => {
  const spot = spotFromSpothole(record())!
  assert.equal(spot.their.call, "N0CALL")
  assert.equal(spot.freq, 14064.5)
  assert.equal(spot.mode, "CW")
  assert.deepEqual(spot.refs, [{ type: "pota", ref: "GB-0001" }])
  assert.equal(spot.spot.timeInMillis, (NOW_S - 2) * 1000)
  assert.equal(spot.spot.source, "spothole")
  assert.equal(spot.spot.sourceInfo?.spotter, "M0TRT")
  assert.equal(spot.spot.sourceInfo?.via, "POTA")
})

test("a two-programme activation carries both refs", () => {
  const spot = spotFromSpothole(record({
    activities: ["POTA", "WWFF"],
    activity_refs: [{ activity: "POTA", id: "GB-0001" }, { activity: "WWFF", id: "gff-0001" }],
  }))!
  assert.deepEqual(spot.refs, [{ type: "pota", ref: "GB-0001" }, { type: "wwff", ref: "GFF-0001" }])
})

test("a programme Ham2K has no extension for is named in the label, not made a ref", () => {
  const spot = spotFromSpothole(record({
    comment: "cq cq",
    activities: ["WAB", "DXpedition"],
    activity_refs: [{ activity: "WAB", id: "SY02" }],
  }))!
  assert.deepEqual(spot.refs, [])
  assert.equal(spot.spot.label, "WAB SY02 · DXpedition · cq cq")
})

test("a plain cluster spot has no refs and the comment as its label", () => {
  const spot = spotFromSpothole(record({ activities: [], activity_refs: [], comment: "73'....Tnx", source: "Cluster" }))!
  assert.deepEqual(spot.refs, [])
  assert.equal(spot.spot.label, "73'....Tnx")
})

test("a spot with no callsign or no time is dropped", () => {
  assert.equal(spotFromSpothole(record({ dx_call: "  " })), undefined)
  assert.equal(spotFromSpothole(record({ time: undefined })), undefined)
})

test("an answer that is not a list throws an error and does not clear the board", () => {
  assert.throws(() => parseSpots('{"error": "down"}'))
  assert.deepEqual(parseSpots("[]"), [])
})

test("the store keeps the newest spot per call, band and mode", () => {
  const store = new SpotStore()
  store.add([
    record({ time: NOW_S - 300, freq: 14062000 }),
    record({ time: NOW_S - 60, freq: 14064500 }),
    record({ time: NOW_S - 120, freq: 7030000 }),
  ])
  const spots = store.spots()
  assert.equal(spots.length, 2)
  assert.deepEqual(spots.map((s) => s.freq), [14064.5, 7030])
})

test("an older spot arriving after a QRT does not bring the station back", () => {
  const store = new SpotStore()
  store.add([record({ time: NOW_S - 10, qrt: true })])
  store.add([record({ time: NOW_S - 100 })])
  assert.deepEqual(store.spots(), [])
  store.add([record({ time: NOW_S })])
  assert.equal(store.spots().length, 1)
})

test("the cursor is the newest received_time seen", () => {
  const store = new SpotStore()
  assert.equal(store.cursor, undefined)
  store.add([record({ received_time: NOW_S + 5.5 }), record({ dx_call: "G0ABC", received_time: NOW_S + 1 })])
  assert.equal(store.cursor, NOW_S + 5.5)
})

test("pruning drops spots over an hour old, and the cursor is dropped when the last spot is dropped", () => {
  const store = new SpotStore()
  store.add([record({ time: NOW_S })])
  store.prune(NOW_S * 1000 + MAX_AGE_MILLIS - 1000)
  assert.equal(store.spots().length, 1)
  store.prune(NOW_S * 1000 + MAX_AGE_MILLIS + 1000)
  assert.equal(store.spots().length, 0)
  assert.equal(store.cursor, undefined)
})

test("the first poll asks for the hour, later ones only for what is new", () => {
  assert.match(spotsUrl(undefined), /^https:\/\/spothole\.app\/api\/v3\/spots\?fields=dx_call,.*&max_age=3600$/)
  assert.match(spotsUrl(NOW_S + 0.5), new RegExp(`&received_since=${NOW_S}\\.5$`))
})
