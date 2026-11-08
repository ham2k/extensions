// Copyright ©️ 2026 Ian Renton
// SPDX-License-Identifier: MIT
//
// Test that spots are fetched as expected, including asking only for new spots after the first
// poll, and that if Spothole is offline it doesn't remove existing spots from the Ham2K logger table.

import { test } from "node:test"
import assert from "node:assert/strict"

import { loadExtension } from "./sdkGapTesting.ts"

let now = Date.UTC(2026, 10, 8, 16, 0, 0)
Date.now = () => now

let sent: string[] = []
let reply: { status: number; body: string } | Error = { status: 200, body: "[]" }

const spothole = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    fetch: (params) => {
      sent.push((params as { url: string }).url)
      if (reply instanceof Error) throw reply
      return reply
    },
  },
})

interface BoardSpot { their: { call: string }; spot: { source: string } }

async function fetchSpots(online = true): Promise<BoardSpot[]> {
  return (await spothole.runHook("spots", "fetchSpots", {}, { ctx: { online } })) as BoardSpot[]
}

function spotJson(call: string, secondsAgo: number, receivedAt: number): string {
  return JSON.stringify({
    dx_call: call, de_call: "M0TRT", freq: 14285000, mode: "SSB",
    time: now / 1000 - secondsAgo, received_time: receivedAt,
    activities: [], activity_refs: [], source: "Cluster",
  })
}

test("offline, it asks nothing", async () => {
  sent = []
  assert.deepEqual(await fetchSpots(false), [])
  assert.deepEqual(sent, [])
})

test("the first poll asks for the last hour", async () => {
  sent = []
  reply = { status: 200, body: `[${spotJson("N0CALL", 60, 1000.25)}]` }
  const spots = await fetchSpots()
  assert.equal(sent.length, 1)
  assert.match(sent[0], /max_age=3600/)
  assert.deepEqual(spots.map((s) => s.their.call), ["N0CALL"])
  assert.equal(spots[0].spot.source, "spothole")
})

test("every request polls the server, so pulling the panel down always gets new spots", async () => {
  sent = []
  reply = { status: 200, body: "[]" }
  assert.deepEqual((await fetchSpots()).map((s) => s.their.call), ["N0CALL"])
  assert.equal(sent.length, 1)
})

test("after the first poll, it asks only for what arrived since last time", async () => {
  sent = []
  reply = { status: 200, body: `[${spotJson("G0ABC", 5, 1050.5)}]` }
  const spots = await fetchSpots()
  assert.equal(sent.length, 1)
  assert.match(sent[0], /received_since=1000\.25$/)
  assert.deepEqual(spots.map((s) => s.their.call).sort(), ["G0ABC", "N0CALL"])
})

test("when Spothole is down, the board keeps what it had and the received_since stays as it was", async () => {
  sent = []
  reply = { status: 502, body: "Bad Gateway" }
  assert.equal((await fetchSpots()).length, 2)

  reply = new Error("timed out")
  assert.equal((await fetchSpots()).length, 2)

  reply = { status: 200, body: "[]" }
  await fetchSpots()
  assert.equal(sent.length, 3)
  assert.match(sent[2], /received_since=1050\.5$/)
})
