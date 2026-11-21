// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The extension through its hooks: that it is an integration woken by each
// contact logged, what its line in the Integrations dialog says, that only
// an `open` costs a read of the log, that an
// operation still carrying the activity from before keeps its name, and how
// the account check reads Club Log's answers.

import { test } from "node:test"
import assert from "node:assert/strict"

import type { HookContext, JSONValue } from "@ham2k/extension-sdk"

import { loadExtension } from "./sdkGapTesting.ts"

let usage: { status: number; body: string } = { status: 200, body: "{}" }
let operatorCall = ""
const fetched: { url: string; headers?: Record<string, string> }[] = []

const ext = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    getSettings: () => ({ operatorCall }),
    fetch: (params) => {
      fetched.push(params as { url: string; headers?: Record<string, string> })
      return usage
    },
  },
})

const operation = { uuid: "op-1", stationCall: "KI2D" }
const none = { logged: [], updated: [], deleted: [] }

function context(token: string | undefined, reads: string[]): Partial<HookContext> {
  return {
    online: true,
    account: token ? { credentials: { token } } : undefined,
    getQsos: async (uuid: string) => {
      reads.push(uuid)
      return []
    },
  }
}

function observing(reasons: string[], changes: JSONValue = none) {
  return { integrationKey: "livestream", operation, qsoCount: 0, config: {}, reasons, clock: { nowMillis: 0, realNowMillis: 0 }, changes }
}

test("it offers one integration, woken by each contact logged", async () => {
  const offered = (await ext.runHook("integration", "getIntegrations", {})) as { key: string; title: string; on: string[] }[]
  assert.deepEqual(
    offered.map(({ key, title, on }) => ({ key, title, on })),
    [{ key: "livestream", title: "Club Log Livestream", on: ["qsoLogged"] }],
  )
})

// The line follows the operation, not the descriptor: the station call is
// what Club Log files the contacts under, and an operation with no call, or
// a device with no token, streams nothing at all and must say so.
test("its line names the call it streams as, or what keeps it from streaming", async () => {
  const describe = (stationCall: string, token?: string) =>
    ext.runHook(
      "integration",
      "describe",
      { integrationKey: "livestream", operation: { uuid: "op-1", stationCall }, config: {} },
      { ctx: context(token, []) },
    ) as Promise<string>
  assert.equal(await describe("ki2d ", "cl_abc"), "Stream KI2D contacts to Club Log as they are logged")
  assert.match(await describe(" ", "cl_abc"), /station call/)
  assert.match(await describe("KI2D"), /API token/)
})

// The sweep after a restart needs the log, and nothing else does: a read on
// every call would be a full read of the log per contact logged.
test("only an open reads the operation's log", async () => {
  const reads: string[] = []
  const ctx = context("cl_abc", reads)
  await ext.runHook("integration", "observe", observing(["qsoLogged"], { ...none, logged: [{ uuid: "u1", their: { call: "W1AW" } }] }), { ctx })
  assert.deepEqual(reads, [])
  await ext.runHook("integration", "observe", observing(["open"]), { ctx })
  assert.deepEqual(reads, ["op-1"])
})

test("an operation that still carries the activity from before keeps its name, and says where the switch is", async () => {
  const ref = (await ext.runHook("ref:clublogLivestream", "decorateRef", { ref: { type: "clublogLivestream" } })) as { label: string; name: string }
  assert.equal(ref.label, "Club Log Livestream")
  assert.match(ref.name, /Integrations/)
})

test("the account check sends the token as a bearer and reads a 401 as a refused token", async () => {
  fetched.length = 0
  operatorCall = ""
  usage = { status: 200, body: JSON.stringify({ minute: { used: 1, limit: 60 } }) }
  const accepted = await ext.runHook("account", "testCredentials", { token: " cl_abc " })
  assert.equal(accepted, "Connected to Club Log")
  assert.equal(fetched[0].url, "https://clublog.org/api/v1/me/usage")
  assert.equal(fetched[0].headers?.Authorization, "Bearer cl_abc")

  usage = { status: 401, body: JSON.stringify({ error: { code: "unauthorized", message: "unknown token" } }) }
  await assert.rejects(ext.runHook("account", "testCredentials", { token: "cl_bad" }) as Promise<JSONValue>)
  await assert.rejects(ext.runHook("account", "testCredentials", { token: "" }) as Promise<JSONValue>)
})

// "Connected as" is only said after Club Log answered for that call's own
// log: a check that just named the profile's call would claim an account it
// never asked about.
test("with an operator call, the check asks for that call's log and says whether the account holds it", async () => {
  fetched.length = 0
  operatorCall = "ki2d"
  usage = { status: 200, body: JSON.stringify({ qsos: [] }) }
  assert.equal(await ext.runHook("account", "testCredentials", { token: "cl_abc" }), "Connected as KI2D")
  assert.equal(fetched[0].url, "https://clublog.org/api/v1/logs/KI2D/qsos?limit=1")

  usage = { status: 403, body: JSON.stringify({ error: { code: "forbidden", message: "not your callsign" } }) }
  const notHeld = (await ext.runHook("account", "testCredentials", { token: "cl_abc" })) as string
  assert.match(notHeld, /does not hold KI2D/)

  usage = { status: 401, body: JSON.stringify({ error: { code: "unauthorized", message: "unknown token" } }) }
  await assert.rejects(ext.runHook("account", "testCredentials", { token: "cl_bad" }) as Promise<JSONValue>)
  operatorCall = ""
})
