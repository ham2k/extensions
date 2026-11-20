// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The logbook keys in Settings. The traps: a row titled by a stale logbook
// after its key was edited; a key QRZ refuses saved as if it opened one; and,
// with the keychain unreadable, an empty list shown that would be saved over
// the keys the operator has.

import { test } from "node:test"
import assert from "node:assert/strict"

import { loadExtension } from "./sdkGapTesting.ts"

import manifest from "../manifest.json" with { type: "json" }

let statusAsked: string[] = []
let stored: unknown[] = []

const form = (body: string): Record<string, string> => Object.fromEntries(body.split("&").map((pair) => pair.split("=").map((part) => decodeURIComponent(part))))

const qrz = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    fetch: (params) => {
      const sent = form(String(params.body ?? ""))
      statusAsked.push(sent.KEY)
      if (sent.KEY === "BAD-KEY") return { status: 200, body: "RESULT=FAIL&REASON=invalid+api+key" }
      if (sent.KEY === "UNREACHED") return { status: 503, body: "" }
      return { status: 200, body: `RESULT=OK&CALLSIGN=${sent.KEY === "KEY-B" ? "N0DEV%2FP" : "N0DEV"}` }
    },
    keychainSet: (params) => {
      stored.push(params)
      return null
    },
  },
})

const panel = { panelKey: "ham2k-qrz", fieldKey: "logbooks", state: {} }

test("the panel goes in Exports & Imports, and only while the app's push experiment is on", async () => {
  const [descriptor] = (await qrz.runHook("settingsPanel", "getPanels", {}, { ctx: { enabledExperiments: ["push"] } })) as { section: string }[]
  assert.equal(descriptor.section, "exports")
  assert.deepEqual(await qrz.runHook("settingsPanel", "getPanels", {}, { ctx: { enabledExperiments: [] } }), [])
})

test("each row is titled by the logbook its key opens, and the key is a secret", async () => {
  const definition = (await qrz.runHook("settingsPanel", "getDefinition", { panelKey: "ham2k-qrz" }, {
    ctx: { keychain: { logbooks: [{ key: "KEY-A", call: "N0DEV", checked: "KEY-A" }] } } as never,
  })) as { elements: { fieldType?: string; value: { title: string }[]; itemFields: { fieldType: string }[] }[] }
  const list = definition.elements.find((element) => element.fieldType === "list")!
  assert.deepEqual(list.value.map((row) => row.title), ['Logbook "N0DEV"'])
  assert.equal(list.itemFields[0].fieldType, "secret")
})

test("a new key is named by QRZ once; a row already named is not asked about again", async () => {
  statusAsked = []
  const rows = [{ key: "KEY-A", call: "N0DEV", checked: "KEY-A", title: 'Logbook "N0DEV"' }, { key: " KEY-B " }]
  assert.equal(await qrz.runHook("settingsPanel", "validateField", { ...panel, value: rows }), null)
  const named = await qrz.runHook("settingsPanel", "transformField", { ...panel, value: rows })
  assert.deepEqual(named, [
    { key: "KEY-A", call: "N0DEV", checked: "KEY-A" },
    { key: "KEY-B", call: "N0DEV/P", checked: "KEY-B" },
  ])
  assert.deepEqual(statusAsked, ["KEY-B"], "validated and transformed with one STATUS")
})

test("a key edited since it was named is asked about again, not titled by its old logbook", async () => {
  statusAsked = []
  const named = await qrz.runHook("settingsPanel", "transformField", { ...panel, value: [{ key: "KEY-B", call: "N0DEV", checked: "KEY-A" }] })
  assert.deepEqual(named, [{ key: "KEY-B", call: "N0DEV/P", checked: "KEY-B" }])
})

test("a key QRZ refuses is refused with QRZ's reason", async () => {
  const error = await qrz.runHook("settingsPanel", "validateField", { ...panel, value: [{ key: "BAD-KEY" }] })
  assert.equal(error, "QRZ.com did not accept the key BAD-…: invalid api key")
})

test("a key QRZ could not be asked about is not called refused", async () => {
  const error = await qrz.runHook("settingsPanel", "validateField", { ...panel, value: [{ key: "UNREACHED" }] })
  assert.equal(error, "Couldn't reach QRZ.com to check the key UNRE…: QRZ.com Logbook answered HTTP 503")
})

test("what is saved goes to the keychain: the keys and their logbooks, never a row's title or an empty row", async () => {
  stored = []
  await qrz.runHook("settingsPanel", "onChangeField", {
    ...panel,
    value: [{ key: "KEY-A", call: "N0DEV", checked: "KEY-A", title: 'Logbook "N0DEV"' }, { key: "" }],
  })
  assert.deepEqual(stored, [{ key: "logbooks", value: [{ key: "KEY-A", call: "N0DEV", checked: "KEY-A" }] }])
})

test("the panel leads with the QRZ.com login the pushes sign in with, which the app opens as this extension's own account", async () => {
  const definition = (await qrz.runHook("settingsPanel", "getDefinition", { panelKey: "ham2k-qrz" }, { ctx: { keychain: {} } as never })) as {
    elements: { fieldType?: string; account?: { key: string } }[]
  }
  // A key other than the account hook's kvKey names an account the app does not find, and the row is left out.
  assert.equal(definition.elements[0].fieldType, "account")
  assert.equal(definition.elements[0].account?.key, manifest.key)
})

test("with the keychain unreadable the panel says so instead of showing an empty list, and the push rows say so too", async () => {
  const definition = (await qrz.runHook("settingsPanel", "getDefinition", { panelKey: "ham2k-qrz" }, { ctx: { keychain: undefined } as never })) as {
    elements: { type: string; fieldType?: string }[]
  }
  assert.deepEqual(definition.elements.map((element) => element.fieldType ?? element.type), ["account", "markdown"])
  await assert.rejects(
    qrz.runHook("transfer", "suggestPushes", { service: "qrz", scope: { kind: "operation", operation: {} } }, { ctx: { keychain: undefined } as never }),
    /secure storage is unavailable/,
  )
})
