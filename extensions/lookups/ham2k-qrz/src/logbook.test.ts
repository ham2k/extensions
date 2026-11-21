// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Pushes to QRZ.com Logbook. The traps: a changed contact sent with REPLACE
// alone lands beside the old one, so the old one has to go first; a contact
// already gone from the logbook is not a failure; and a destination must name
// a logbook one of the operator's keys opens, or the push would go nowhere.

import { test } from "node:test"
import assert from "node:assert/strict"

import { loadExtension } from "./sdkGapTesting.ts"
import { parseReply } from "./logbook.ts"

let calls: Record<string, string>[] = []
let answer: (params: Record<string, string>) => string = () => "RESULT=OK"

const form = (body: string): Record<string, string> => Object.fromEntries(body.split("&").map((pair) => pair.split("=").map((part) => decodeURIComponent(part))))

const qrz = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    fetch: (params) => {
      const sent = form(String(params.body ?? ""))
      calls.push(sent)
      return { status: 200, body: answer(sent) }
    },
  },
  ctx: { keychain: { logbooks: [{ key: "KEY-A" }, { key: "KEY-B" }] } } as never,
})

// KEY-A answers in the nested DATA shape, KEY-B with top-level fields: both
// are read, so a reply in either shape names its logbook.
const status = (params: Record<string, string>) =>
  params.ACTION !== "STATUS"
    ? null
    : params.KEY === "KEY-A"
      ? `RESULT=OK&DATA=${encodeURIComponent("CALLSIGN=N0DEV&BOOK_NAME=Home+station")}`
      : "RESULT=OK&CALLSIGN=N0DEV%2FP"

test("a reply decodes its form encoding", () => {
  assert.deepEqual(parseReply("RESULT=FAIL&REASON=duplicate+QSO%3A+W1AW&COUNT=0"), { RESULT: "FAIL", REASON: "duplicate QSO: W1AW", COUNT: "0" })
})

// A call with no logbook is usually another operator's in a shared log:
// offering it, or failing on it, would push their contacts nowhere or bury
// the operator's own logbook under an error.
test("each station call one of the keys opens a logbook for is a destination; the others are left out", async () => {
  answer = (params) => status(params) ?? "RESULT=FAIL"
  const scope = { kind: "operation", operation: {} }
  assert.deepEqual(await qrz.runHook("transfer", "suggestDestinations", { service: "qrz", scope, stationCalls: ["W1AW", "n0dev/p", "N0DEV"] }), [
    { id: "N0DEV/P", label: 'Logbook "N0DEV/P"', stationCall: "N0DEV/P" },
    { id: "N0DEV", label: 'Logbook "Home station"', stationCall: "N0DEV" },
  ])
})

test("a contact sent before is removed, then sent again, and answers its new id", async () => {
  calls = []
  answer = (params) => status(params) ?? (params.ACTION === "INSERT" ? "RESULT=OK&LOGID=200&COUNT=1" : "RESULT=OK&COUNT=1")
  const results = await qrz.runHook("transfer", "push", {
    service: "qrz",
    stationCall: "N0DEV",
    destination: { id: "N0DEV" },
    records: [{ uuid: "q1", adif: ["<CALL:4>W1AW <EOR>"], id: "100" }],
  })
  assert.deepEqual(results, [{ uuid: "q1", id: "200" }])
  const writes = calls.filter((c) => c.ACTION !== "STATUS")
  assert.deepEqual(
    writes.map((c) => [c.ACTION, c.LOGIDS ?? c.ADIF]),
    [
      ["DELETE", "100"],
      ["INSERT", "<CALL:4>W1AW <EOR>"],
    ],
  )
  assert.equal(writes[1].KEY, "KEY-A", "the key of the logbook the destination names")
})

test("a delete of a contact QRZ no longer has succeeds; a refused insert says why", async () => {
  answer = (params) =>
    status(params) ?? (params.ACTION === "DELETE" ? "RESULT=FAIL&REASON=logid+not+found" : "RESULT=FAIL&REASON=duplicate+QSO")
  const results = await qrz.runHook("transfer", "push", {
    service: "qrz",
    stationCall: "N0DEV",
    destination: { id: "N0DEV" },
    records: [
      { uuid: "gone", adif: [], deleted: true, id: "100" },
      { uuid: "dupe", adif: ["<CALL:4>W1AW <EOR>"] },
    ],
  })
  assert.deepEqual(results, [{ uuid: "gone" }, { uuid: "dupe", error: "duplicate QSO" }])
})

// "No key opens a logbook" sends the operator to add a key they already
// entered: a push to the logbook a refused key was for says QRZ refused it.
test("a push to a logbook whose key QRZ refuses says so, not that no key was entered", async () => {
  answer = (params) => (params.ACTION === "STATUS" ? "RESULT=FAIL&REASON=invalid+api+key" : "RESULT=OK")
  await assert.rejects(
    qrz.runHook(
      "transfer",
      "push",
      { service: "qrz", stationCall: "N0DEV", destination: { id: "N0DEV" }, records: [] },
      { ctx: { keychain: { logbooks: [{ key: "RESET-KEY" }] } } as never },
    ),
    { message: "QRZ.com did not accept the key RESE…: invalid api key" },
  )
})

test("a finished operation never pushed has its push marked due", async () => {
  const offered = (await qrz.runHook("transfer", "suggestPushes", { scope: { kind: "operation", operation: { status: "completed" } } })) as any[]
  assert.deepEqual(
    offered.map((s) => [s.key, s.select, s.emphasis]),
    [
      ["new", { notSentTo: "qrz" }, "due"],
      ["updates", { changedSince: "qrz" }, "updates"],
    ],
  )
  const again = (await qrz.runHook("transfer", "suggestPushes", {
    scope: { kind: "operation", operation: { status: "completed" } },
    sent: { "qrz:n0dev": { sentCount: 1 } },
  })) as any[]
  assert.equal(again[0].emphasis, undefined, "pushed to a logbook before: no longer due")
})

// A whole logbook comes back a page at a time: a pull that stopped at the
// first page would import 250 contacts of a thousand and say it was done.
test("a pull fetches every page, each after the last LOGID, and hands back what the app imports", async () => {
  calls = []
  const page = (from: number, to: number) => {
    const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i)
    const adif = "<ADIF_VER:5>3.1.4<EOH>" + ids.map((id) => `<CALL:4>W1AW<APP_QRZLOG_LOGID:${String(id).length}>${id}<EOR>`).join("")
    return `RESULT=OK&COUNT=${ids.length}&LOGIDS=${ids.join(",")}&ADIF=${encodeURIComponent(adif)}`
  }
  answer = (params) =>
    status(params) ?? (params.OPTION.includes("AFTERLOGID:0") ? page(1, 250) : params.OPTION.includes("AFTERLOGID:250") ? page(251, 260) : "RESULT=FAIL&COUNT=0")
  const result = (await qrz.runHook("transfer", "pull", {
    service: "qrz",
    destination: { id: "N0DEV", label: 'Logbook "Home station"', stationCall: "N0DEV" },
  })) as { content: string; cursor: string; idField: string; format: string }
  const fetches = calls.filter((sent) => sent.ACTION === "FETCH")
  assert.deepEqual(
    fetches.map((sent) => [sent.KEY, sent.OPTION]),
    [
      ["KEY-A", "TYPE:ADIF,MAX:250,AFTERLOGID:0"],
      ["KEY-A", "TYPE:ADIF,MAX:250,AFTERLOGID:250"],
    ],
  )
  assert.equal(result.format, "adif")
  assert.equal(result.idField, "app_qrzlog_logid")
  assert.equal(result.content.match(/<EOR>/g)?.length, 260)
  assert.equal(result.content.match(/<EOH>/gi)?.length, 1, "one header, not one per page")
  assert.match(result.cursor, /^\d{4}-\d{2}-\d{2}$/)
})

test("a pull since the last one asks only for what changed, and nothing changed is an empty file, not a failure", async () => {
  calls = []
  answer = (params) => status(params) ?? "RESULT=FAIL&REASON=no+log+entries+found&COUNT=0"
  const result = (await qrz.runHook("transfer", "pull", {
    service: "qrz",
    destination: { id: "N0DEV", stationCall: "N0DEV" },
    cursor: "2026-11-20",
  })) as { content: string }
  assert.equal(calls.find((sent) => sent.ACTION === "FETCH")?.OPTION, "TYPE:ADIF,MAX:250,AFTERLOGID:0,MODSINCE:2026-11-20")
  assert.equal(result.content.match(/<EOR>/g), null)
})

test("a pull from a logbook no key opens says why rather than bringing nothing", async () => {
  answer = (params) => status(params) ?? "RESULT=OK"
  await assert.rejects(qrz.runHook("transfer", "pull", { service: "qrz", destination: { id: "K9ZZ" } }), /K9ZZ/)
})
