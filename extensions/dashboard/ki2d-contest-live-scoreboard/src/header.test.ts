// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict"
import { test } from "node:test"

import type { JSONValue } from "@ham2k/extension-sdk"

import { HEADER_FRESH_MS, HeaderStore, operatorsOf } from "./header.ts"
import { contestRefOf } from "./live.ts"

type Qso = Record<string, JSONValue>

const operationIn = (mode: string): Qso => ({ uuid: "op-1", stationCall: "KI2D", refs: [{ type: "cqww", contest: true, mode }] })
const logFor = (mode: string) => `START-OF-LOG: 3.0\nCONTEST: CQ-WW-${mode}\nCATEGORY-OPERATOR: SINGLE-OP\nCLUB: Frankford Radio Club\nQSO: 14025 CW 2026-11-28 0000 KI2D 599 05 DL1ABC 599 14\nEND-OF-LOG:\n`
const qso = (call: string, operatorCall?: string): Qso => ({ their: { call: "DL1ABC" }, our: { call, ...(operatorCall ? { operatorCall } : {}) } })

function store() {
  let now = 1_000_000
  return { headers: new HeaderStore(() => now), pass: (ms: number) => (now += ms) }
}

test("a header is kept, with its contest id, until the contest's settings change", () => {
  const { headers } = store()
  const cw = operationIn("CW")
  const contest = contestRefOf(cw)!
  const held = headers.set("op-1", cw, contest, [qso("KI2D")], logFor("CW"))
  assert.equal(held.cabrilloId, "CQ-WW-CW")
  assert.equal(held.headers.CLUB, "Frankford Radio Club")
  assert.equal(held.headers.QSO, undefined)
  assert.equal(headers.get("op-1", operationIn("CW"), contestRefOf(operationIn("CW"))!), held)

  const ssb = operationIn("SSB")
  assert.equal(headers.get("op-1", ssb, contestRefOf(ssb)!), undefined, "switched to SSB: exported again, for the SSB board")
  assert.equal(headers.get("op-1", { ...cw, stationCall: "N2X" }, contest), undefined, "another station call")
  assert.equal(headers.get("op-2", cw, contest), undefined, "another operation")
})

test("a post's header is exported again once a new operator logs, and every half hour", () => {
  const { headers, pass } = store()
  const operation = operationIn("CW")
  const contest = contestRefOf(operation)!
  const log = [qso("KI2D"), qso("KI2D", "N2ABC")]
  headers.set("op-1", operation, contest, log, logFor("CW"))
  assert.ok(headers.get("op-1", operation, contest, [...log, qso("KI2D", "n2abc ")]), "the same operators, more contacts")
  assert.equal(headers.get("op-1", operation, contest, [...log, qso("KI2D", "W2XYZ")]), undefined)
  assert.ok(headers.get("op-1", operation, contest), "a pane needs only the id")

  pass(HEADER_FRESH_MS - 1)
  assert.ok(headers.get("op-1", operation, contest, log))
  pass(1)
  assert.equal(headers.get("op-1", operation, contest, log), undefined, "the profile's CLUB may have changed")
})

test("the log's operators are its contacts' operator calls, or their station calls", () => {
  assert.equal(operatorsOf([qso("KI2D", "W2XYZ"), qso("ki2d"), qso("KI2D", "N2ABC"), { ...qso("K1ZZ"), deleted: true }]), "KI2D N2ABC W2XYZ")
  assert.equal(operatorsOf([]), "")
})

test("an export with no CONTEST line is kept as one without an id", () => {
  const { headers } = store()
  const operation = operationIn("CW")
  assert.equal(headers.set("op-1", operation, contestRefOf(operation)!, [], "START-OF-LOG: 3.0\nCALLSIGN: KI2D\n").cabrilloId, undefined)
})
