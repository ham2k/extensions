// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// A park across several states publishes one point for all of it, and the
// app places an operation that has no location of its own at its first
// park's point — unless the park says it is `largeArea`. The trap: a flag set
// on one path and not the other. A park reaches the operation through
// `suggest` (stored verbatim) and through `decorateRef` (a typed code, an
// outline match, a re-decoration), and either one without the flag puts an
// Appalachian Trail activation at a point in Virginia.

import { test } from "node:test"
import assert from "node:assert/strict"

import { loadExtension } from "./sdkGapTesting.ts"

const parks: Record<string, { key: string; name: string; lat: number; lon: number; flags: number; data: Record<string, unknown> }> = {
  "US-4567": { key: "US-4567", name: "Appalachian National Scenic Trail", lat: 37.5, lon: -79.5, flags: 1, data: { grid6: "FM07ul", locationDesc: "US-GA,US-NC,US-TN,US-VA,US-ME" } },
  "US-0001": { key: "US-0001", name: "Acadia National Park", lat: 44.35, lon: -68.21, flags: 1, data: { grid6: "FN54vi", locationDesc: "US-ME" } },
}

const extension = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    dbLookupSelectOne: (params) => parks[params.key as string] ?? null,
    dbLookupSelectByLocation: () => Object.values(parks),
  },
})

const decorate = async (ref: Record<string, unknown>) =>
  (await extension.runHook("ref:potaActivation", "decorateRef", { ref: { type: "potaActivation", ...ref } })) as Record<string, unknown>

test("a park spanning several areas is decorated as largeArea, a park in one is not", async () => {
  assert.equal((await decorate({ ref: "US-4567" })).largeArea, true)
  assert.equal((await decorate({ ref: "US-0001" })).largeArea, false)
})

// A ref is stored with its decoration on it; re-decorated as a different
// park, a mark left over from the trail would keep the new park from ever
// placing the operation.
test("re-decorating a ref as a park in one area clears the mark", async () => {
  assert.equal((await decorate({ ref: "US-0001", largeArea: true })).largeArea, false)
})

test("a code that resolves to no park carries no mark", async () => {
  assert.equal((await decorate({ ref: "US-9999", largeArea: true })).largeArea, undefined)
})

test("the nearby suggestions carry the mark as well", async () => {
  const suggestions = (await extension.runHook("activity", "suggest", { location: { lat: 40, lon: -75 } })) as Record<string, unknown>[]
  const byRef = Object.fromEntries(suggestions.map((s) => [s.ref, s]))
  assert.equal(byRef["US-4567"].largeArea, true)
  assert.equal(byRef["US-0001"].largeArea, false)
})

// A fully-formed code typed into the search is offered even when no list
// row came back for it, resolved through the same park lookup.
test("a park named exactly in the search carries the mark", async () => {
  const suggestions = (await extension.runHook("activity", "suggest", { location: { lat: 40, lon: -75 }, searchTerm: "US-4567" })) as Record<string, unknown>[]
  assert.equal(suggestions.find((s) => s.ref === "US-4567")?.largeArea, true)
})
