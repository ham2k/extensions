// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import { test } from "node:test"
import assert from "node:assert/strict"

import { callRecordLookup, currentCallAmong, isInactiveRecord, lookupCallRecord, tFor } from "./index.ts"
import type { CallRecordSource } from "./index.ts"
import { OFFLINE_SOURCE, registerOfflineCalls } from "./offline.ts"

const records =
  (byCall: Record<string, Record<string, unknown>>): CallRecordSource =>
  async (call) =>
    byCall[call] ?? null

test("each Canadian class names its own level, so the band plan knows who may operate HF", () => {
  // The service splits Basic three ways, and only the plain one stays off HF:
  // a map naming Advanced alone shows Honours and Morse holders no level.
  const level = (cls: string) => callRecordLookup({ call: "VE3X", country: "CA", class: cls }, { call: "VE3X", source: "s", locationScope: "qth" }).licenseLevel
  assert.equal(level("Basic"), "ca:B")
  assert.equal(level("Basic with Honours"), "ca:B/H")
  assert.equal(level("Basic + Morse"), "ca:B+5")
  assert.equal(level("Advanced"), "ca:B+A")
})

test("a record becomes a located answer, its country spelled out", () => {
  const answer = callRecordLookup(
    { call: "AA0A", country: "US", name: "Rosebrook, John", city: "Sioux Falls", state: "SD", grid: "EN13po61", class: "Extra" },
    { call: "AA0A", source: "s", locationScope: "qth" },
  )
  assert.equal(answer.country, "United States")
  assert.equal(answer.location, "Sioux Falls, SD")
  assert.equal(answer.grid, "EN13po61")
  assert.equal(answer.licenseLevel, "us:E")
})

test("a portable call is answered by its base call, as the operator's home QTH", async () => {
  const answer = await lookupCallRecord(
    { call: "KI2D/P", baseCall: "KI2D", locationScope: "portable" } as any,
    records({ KI2D: { call: "KI2D", country: "US", city: "Woodridge", state: "NY" } }),
    "s",
  )
  assert.equal(answer?.call, "KI2D")
  // Kept as `portable`, the home town would place a station that is away.
  assert.equal(answer?.locationScope, "qth")
})

test("a call with no record answers nothing", async () => {
  assert.equal(await lookupCallRecord({ call: "N0NE", baseCall: "N0NE" } as any, records({}), "s"), null)
})

// What services.ham2k.net lists under KI2D's FCC registration number.
const KI2D_HOLDER = [
  { call: "KD2TUC", country: "US", name: "Delmont, Sebastian D", status: "C", granted: "04/22/2020", frn: "0029450111" },
  { call: "KI2D", country: "US", name: "Delmont, Sebastian D", status: "A", granted: "05/04/2021", prevCall: "W2ASD", frn: "0029450111" },
  { call: "W2ASD", country: "US", name: "Delmont, Sebastian D", status: "C", granted: "05/15/2020", prevCall: "KD2TUC", frn: "0029450111" },
  { call: "WRYQ410", country: "US", service: "gmrs", name: "Delmont, Sebastian D", status: "A", granted: "09/07/2023", frn: "0029450111" },
]
const W2ASD = KI2D_HOLDER[2]
const en = { t: tFor({ locale: "en" }) }

test("a cancelled call says so beside the name, and who the holder is now", async () => {
  const asked: string[] = []
  const answer = await lookupCallRecord({ call: "W2ASD" } as any, records({ W2ASD }), "s", {
    ...en,
    currentCall: async (record) => {
      asked.push(record.frn as string)
      return currentCallAmong(KI2D_HOLDER, record.call as string)
    },
  })
  assert.equal(answer?.name, "Delmont, Sebastian D (Currently KI2D)")
  assert.deepEqual(asked, ["0029450111"])
})

test("an inactive call whose holder has no current call, or cannot be found, is only marked inactive", async () => {
  const none = await lookupCallRecord({ call: "W2ASD" } as any, records({ W2ASD }), "s", { ...en, currentCall: async () => undefined })
  assert.equal(none?.name, "Delmont, Sebastian D (Inactive)")
  const failed = await lookupCallRecord({ call: "W2ASD" } as any, records({ W2ASD }), "s", {
    ...en,
    currentCall: async () => {
      throw new Error("offline")
    },
  })
  assert.equal(failed?.name, "Delmont, Sebastian D (Inactive)")
  const es = await lookupCallRecord({ call: "W2ASD" } as any, records({ W2ASD }), "s", { t: tFor({ locale: "es" }) })
  assert.equal(es?.name, "Delmont, Sebastian D (Inactivo)")
})

test("an active call, or one whose record has no status, keeps its name as it is, without asking who the holder is now", async () => {
  const currentCall = async () => {
    throw new Error("asked")
  }
  const active = await lookupCallRecord({ call: "KI2D" } as any, records({ KI2D: KI2D_HOLDER[1] }), "s", { ...en, currentCall })
  assert.equal(active?.name, "Delmont, Sebastian D")
  const compact = await lookupCallRecord({ call: "VE3KI" } as any, records({ VE3KI: { call: "VE3KI", country: "CA", name: "Richard" } }), "s", { ...en, currentCall })
  assert.equal(compact?.name, "Richard")
})

test("only a cancelled, expired or terminated license is inactive, not a pending one", () => {
  const inactive = (status?: string) => isInactiveRecord({ call: "N0X", status })
  assert.deepEqual([inactive("C"), inactive("E"), inactive("T")], [true, true, true])
  assert.deepEqual([inactive("A"), inactive("L"), inactive("X"), inactive(undefined)], [false, false, false, false])
})

test("the holder's current call is their newest active amateur license, never a GMRS one or the call itself", () => {
  assert.equal(currentCallAmong(KI2D_HOLDER, "W2ASD"), "KI2D")
  assert.equal(currentCallAmong(KI2D_HOLDER, "ki2d"), undefined, "KI2D is the active one; there is no other")
  assert.equal(
    currentCallAmong(
      [
        { call: "N0OLD", status: "A", granted: "12/31/2019" },
        { call: "N0NEW", status: "A", granted: "01/02/2020" },
      ],
      "N0GONE",
    ),
    "N0NEW",
    "a December grant sorts before a January one a year later",
  )
  assert.equal(currentCallAmong([{ call: "KI2D", status: "A", service: null }], "W2ASD"), "KI2D", "an amateur license may name its service")
  assert.equal(currentCallAmong({ error: "not found" }, "W2ASD"), undefined)
})

test("the offline set registers a ham2k data file and a lookup that reads it from the device", async () => {
  const hooks: Record<string, any> = {}
  registerOfflineCalls((category, params) => (hooks[category] = params), { key: "ham2k-offline-calls-hf", set: "hf" })

  const file = hooks.dataFile.hook
  assert.equal(file.fetchType, "ham2k")
  assert.equal(file.url, "https://services.ham2k.net/lookups/calls/download?set=hf")
  assert.equal(file.deltaUrl, "https://services.ham2k.net/lookups/calls/delta?set=hf&since={since}")
  assert.equal(file.fields.key, "call", "a row keyed by anything else is never found by its call")
  // Above ham2k-lookup (10), this fills what that source checks before
  // fetching: online, the contact never gets a stored online answer, and the
  // app queues it for one on every save.
  assert.ok(hooks.lookup.priority < 10, "below the online Ham2K lookup")

  const asked: unknown[] = []
  ;(globalThis as any).__halo = {
    hostCall: async (method: string, params: Record<string, unknown>) => {
      asked.push([method, params])
      return method === "dbLookupSelectOne" && params.key === "VE3KI"
        ? { category: params.category, key: "VE3KI", data: { call: "VE3KI", country: "CA", name: "Richard", grid: "FN25ce08", class: "Advanced" } }
        : null
    },
  }
  try {
    const [answer] = await hooks.lookup.hook.lookupCall({ callInfo: { call: "VE3KI" }, qso: {}, operation: {} }, { online: false })
    assert.deepEqual(asked, [["dbLookupSelectOne", { category: file.category, key: "VE3KI" }]], "the lookup reads the category the data file fills")
    assert.equal(answer.name, "Richard", "it answers with the network off")
    // The app counts a stored answer from `services.ham2k.net` with no
    // `online` as a network one, and never fetches that contact online again.
    assert.equal(answer.source, OFFLINE_SOURCE)
    assert.notEqual(answer.source, "services.ham2k.net")
    assert.equal(answer.online, undefined)
  } finally {
    delete (globalThis as any).__halo
  }
})
