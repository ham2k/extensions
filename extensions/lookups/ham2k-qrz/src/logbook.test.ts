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
let answer: (params: Record<string, string>) => string | { status: number; body: string } = () => "RESULT=OK"

const form = (body: string): Record<string, string> => Object.fromEntries(body.split("&").map((pair) => pair.split("=").map((part) => decodeURIComponent(part))))

const qrz = await loadExtension(() => import("./index.ts"), {
  hostCalls: {
    fetch: (params) => {
      const sent = form(String(params.body ?? ""))
      calls.push(sent)
      const response = answer(sent)
      return typeof response === "string" ? { status: 200, body: response } : response
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

const pullLogbook = (cursor?: string) => qrz.runHook("transfer", "pull", {
  service: "qrz",
  destination: { id: "N0DEV", label: 'Logbook "Home station"', stationCall: "N0DEV" },
  cursor,
}) as Promise<{ content: string; cursor: string; idField: string; format: string }>

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

const qso = (id: number) => `<CALL:4>W1AW<APP_QRZLOG_LOGID:${String(id).length}>${id}<EOR>`

// A whole logbook comes back a page at a time. A pull that stops after the
// first 250 contacts silently leaves the rest behind.
test("a pull pages using ADIF IDs, including a logbook ending on a full page", async () => {
  for (const { size, includeLogIds } of [
    { size: 250, includeLogIds: false },
    { size: 260, includeLogIds: false },
    { size: 260, includeLogIds: true },
  ]) {
    calls = []
    const page = (from: number, to: number) => {
      const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i)
      const adif = "<ADIF_VER:5>3.1.4<EOH>" + ids.map(qso).join("")
      const count = includeLogIds || from > 1 ? ids.length : size
      const logIds = includeLogIds ? `&LOGIDS=${ids.join(",")}` : ""
      return `RESULT=OK&COUNT=${count}${logIds}&ADIF=${encodeURIComponent(adif)}`
    }
    answer = (params) =>
      status(params) ?? (params.OPTION.endsWith("AFTERLOGID:0") ? page(1, 250) : page(250, size))
    const result = await pullLogbook()
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
    assert.equal(result.content, "<EOH>\n" + Array.from({ length: size }, (_, i) => qso(i + 1)).join("\n"), "one header and each contact exactly once")
    assert.match(result.cursor, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test("a fully HTML-escaped ADIF reply preserves its field data for the importer", async () => {
  const comment = "A & B + 100% &lt; <EOR> &COUNT=0"
  const adif = qso(1).replace(/<EOR>$/, `<COMMENT:${comment.length}>${comment}<EOR>`)
  const escaped = adif.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  answer = (params) => status(params) ?? `RESULT=OK&COUNT=1&ADIF=${escaped}`
  const protectedComment = "A & B + 100% &amp;lt; <EOR> &COUNT=0"
  assert.equal((await pullLogbook()).content, "<EOH>\n" + qso(1).replace(/<EOR>$/, `<COMMENT:${protectedComment.length}>${protectedComment}<EOR>`))
})

test("escaped ADIF tags leave literal entities and other comment text intact", async () => {
  const comment = "A & B + 50%20 &amp; &lt; &#65; &#x41; Café <EOR> &RESULT=FAIL&COUNT=0"
  const first = `&lt;CALL:4&gt;W1AW&lt;COMMENT:${comment.length}&gt;${comment}&lt;APP_QRZLOG_LOGID:1&gt;1&lt;EOR&gt;`
  const second = "&lt;CALL:4&gt;W1AW&lt;COMMENT:5&gt;&amp;    &lt;APP_QRZLOG_LOGID:1&gt;2&lt;EOR&gt;"
  answer = (params) => status(params) ?? `RESULT=OK&COUNT=2&ADIF=${first}${second}`
  // HaLo removes one level of entity escaping from parsed field values.
  const protectedComment = "A & B + 50%20 &amp;amp; &amp;lt; &amp;#65; &amp;#x41; Café <EOR> &RESULT=FAIL&COUNT=0"
  assert.equal((await pullLogbook()).content, [
    "<EOH>",
    `<CALL:4>W1AW<COMMENT:${Buffer.byteLength(protectedComment)}>${protectedComment}<APP_QRZLOG_LOGID:1>1<EOR>`,
    "<CALL:4>W1AW<COMMENT:9>&amp;amp;    <APP_QRZLOG_LOGID:1>2<EOR>",
  ].join("\n"))
})

test("raw and form-encoded ADIF preserve reserved characters", async () => {
  const comment = "A+B 50%20 &amp; &RESULT=FAIL"
  const record = qso(1).replace(/<EOR>$/, `<COMMENT:${comment.length}>${comment}<EOR>`)
  const escapedTags = `&lt;CALL:4&gt;W1AW&lt;APP_QRZLOG_LOGID:1&gt;1&lt;COMMENT:${comment.length}&gt;${comment}&lt;EOR&gt;`
  const fullyEscaped = record.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  const protectedComment = "A+B 50%20 &amp;amp; &RESULT=FAIL"
  const expected = qso(1).replace(/<EOR>$/, `<COMMENT:${protectedComment.length}>${protectedComment}<EOR>`)
  for (const [format, reply] of [
    ["raw ADIF", `RESULT=OK&COUNT=1&ADIF=${record}`],
    ["form-encoded ADIF", new URLSearchParams({ RESULT: "OK", ADIF: record, COUNT: "1" }).toString()],
    ["form-encoded ADIF with escaped tags", new URLSearchParams({ RESULT: "OK", ADIF: escapedTags, COUNT: "1" }).toString()],
    ["form-encoded fully escaped ADIF", new URLSearchParams({ RESULT: "OK", ADIF: fullyEscaped, COUNT: "1" }).toString()],
  ]) {
    answer = (params) => status(params) ?? reply
    assert.equal((await pullLogbook()).content, "<EOH>\n" + expected, format)
  }
})

test("a fully escaped reply can encode supplementary characters as numeric entities", async () => {
  const adif = "&lt;CALL:4&gt;W1AW&lt;APP_QRZLOG_LOGID:1&gt;1&lt;NOTES:4&gt;&#128512;&#x1f600;&lt;EOR&gt;"
  answer = (params) => status(params) ?? `RESULT=OK&COUNT=1&ADIF=${adif}`
  assert.equal((await pullLogbook()).content, "<EOH>\n<CALL:4>W1AW<APP_QRZLOG_LOGID:1>1<NOTES:8>😀😀<EOR>")
})

test("non-ASCII ADIF fields keep the adjoining ID and end-of-record marker", async () => {
  const prefix = "<CALL:4>W1AW"
  const records = [
    prefix + "<NAME:5>José<APP_QRZLOG_LOGID:1>1<EOR>",
    prefix + "<APP_QRZLOG_LOGID:1>2<NAME:5>José<EOR>",
    prefix + "<APP_QRZLOG_LOGID:1>3<NOTES:4>😀<EOR>",
    prefix + "<APP_QRZLOG_LOGID:1>4<NOTES:2>😀<EOR>",
    prefix + "<APP_QRZLOG_LOGID:1>5<NOTES:1>😀<EOR>",
  ]
  const escaped = records.join("").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  answer = (params) => status(params) ?? `RESULT=OK&COUNT=5&ADIF=${escaped}`
  assert.equal((await pullLogbook()).content, "<EOH>\n" + records.join("\n").replace(/<NOTES:[12]>/g, "<NOTES:4>"))
})

test("character lengths keep ID-like text inside a comment and are normalized for HaLo", async () => {
  const literal = "<APP_QRZLOG_LOGID:1>2"
  const comment = "é".repeat(literal.length) + literal
  const adif = `<CALL:4>W1AW<COMMENT:${comment.length}>${comment}<APP_QRZLOG_LOGID:1>1<EOR>`
  answer = (params) => status(params) ?? `RESULT=OK&COUNT=1&ADIF=${encodeURIComponent(adif)}`
  assert.equal((await pullLogbook()).content, "<EOH>\n" + adif.replace(`COMMENT:${comment.length}`, `COMMENT:${Buffer.byteLength(comment)}`))
})

test("a separate QRZ ID list resolves competing interpretations of the same page", async () => {
  const idField = "<APP_QRZLOG_LOGID:1>1"
  const embedded = `<APP_QRZLOG_LOGID:1>2<NOTES:${idField.length}>`
  const comment = "é".repeat(embedded.length) + embedded
  const adif = `<CALL:4>W1AW<COMMENT:${comment.length}>${comment}${idField}<EOR>`
  calls = []
  answer = (params) => status(params) ?? (params.OPTION.startsWith("TYPE:LOGIDS")
    ? "RESULT=OK&COUNT=1&LOGIDS=1"
    : `RESULT=OK&COUNT=1&ADIF=${encodeURIComponent(adif)}`)
  assert.equal((await pullLogbook()).content, "<EOH>\n" + adif.replace(`COMMENT:${comment.length}`, `COMMENT:${Buffer.byteLength(comment)}`))
  assert.deepEqual(calls.filter((sent) => sent.ACTION === "FETCH").map((sent) => sent.OPTION), [
    "TYPE:ADIF,MAX:250,AFTERLOGID:0",
    "TYPE:LOGIDS,MAX:250,AFTERLOGID:0",
  ])

  answer = (params) => status(params) ?? (params.OPTION.startsWith("TYPE:LOGIDS")
    ? "RESULT=OK&COUNT=1&LOGIDS=3"
    : `RESULT=OK&COUNT=1&ADIF=${encodeURIComponent(adif)}`)
  await assert.rejects(pullLogbook(), /page 1 .*does not match the list of 1 record IDs/)
})

test("a short page with a larger matching count needs a corroborating ID list", async () => {
  calls = []
  answer = (params) => status(params) ?? (params.OPTION.startsWith("TYPE:LOGIDS")
    ? "RESULT=OK&COUNT=3&LOGIDS=1"
    : `RESULT=OK&COUNT=3&ADIF=${encodeURIComponent(qso(1))}`)
  assert.equal((await pullLogbook()).content, "<EOH>\n" + qso(1))
  assert.deepEqual(calls.filter((sent) => sent.ACTION === "FETCH").map((sent) => sent.OPTION), [
    "TYPE:ADIF,MAX:250,AFTERLOGID:0",
    "TYPE:LOGIDS,MAX:250,AFTERLOGID:0",
  ])
})

test("a later page must continue from the previous page before any records are returned", async () => {
  const first = Array.from({ length: 250 }, (_, i) => qso(i + 1)).join("")
  answer = (params) => status(params) ?? (params.OPTION.endsWith("AFTERLOGID:0")
    ? `RESULT=OK&COUNT=251&ADIF=${encodeURIComponent(first)}`
    : `RESULT=OK&COUNT=1&ADIF=${encodeURIComponent(qso(251))}`)
  await assert.rejects(pullLogbook(), /page 2 .*did not continue/)
})

test("pull failures report the QRZ reply even with a zero or missing count", async () => {
  for (const [reply, message] of [
    ["RESULT=FAIL&COUNT=0&REASON=Invalid+option", /page 1 .*FAIL, COUNT=0 \(Invalid option\)/],
    ["RESULT=FAIL&COUNT=0&REASON=50% quota exceeded", /page 1 .*FAIL, COUNT=0 \(50% quota exceeded\)/],
    ["RESULT=AUTH&REASON=Subscription+required", /page 1 .*AUTH \(Subscription required\)/],
    ["RESULT=FAIL&COUNT=0", /page 1 .*FAIL, COUNT=0/],
    ["<html>Bad gateway</html>", /page 1 .*missing or invalid RESULT/],
    ["RESULT=OK&COUNT=4", /page 1 .*COUNT=4 and returned 0 ADIF records/],
  ] as const) {
    answer = (params) => status(params) ?? reply
    await assert.rejects(pullLogbook(), message)
  }
})

test("a failed second page rejects the pull even after a full first page", async () => {
  const first = Array.from({ length: 250 }, (_, i) => qso(i + 1)).join("")
  for (const [reply, error] of [
    ["RESULT=FAIL&REASON=Cannot+read+logbook", /page 2 .*FAIL \(Cannot read logbook\)/],
    [{ status: 503, body: "Unavailable" }, /page 2 .*HTTP 503/],
  ] as const) {
    answer = (params) => status(params) ?? (params.OPTION.endsWith("AFTERLOGID:0")
      ? `RESULT=OK&COUNT=250&ADIF=${encodeURIComponent(first)}`
      : reply)
    await assert.rejects(pullLogbook(), error)
  }
})

test("a malformed page reports the record position and reason without field values", async () => {
  const value = "PRIVATE"
  for (const [record, detail] of [
    [`<CALL:7>${value}<EOR>`, /missing APP_QRZLOG_LOGID/],
    [`<APP_QRZLOG_LOGID:7>${value}<EOR>`, /APP_QRZLOG_LOGID is not a positive integer/],
    ["<APP_QRZLOG_LOGID:1>1<APP_QRZLOG_LOGID:1>2<EOR>", /more than one APP_QRZLOG_LOGID/],
    [qso(1), /record ID already appeared/],
    [`<CALL:99>${value}`, /CALL declares length 99 with only 7 UTF-16 units left/],
    [`<CALL:7>${value}`, /expected <EOR> after CALL/],
    ["<EOH>", /unexpected <EOH>/],
  ] as const) {
    const adif = qso(1) + record
    answer = (params) => status(params) ?? `RESULT=OK&COUNT=2&ADIF=${encodeURIComponent(adif)}`
    await assert.rejects(pullLogbook(), (error: Error) => {
      assert.match(error.message, /page 1 .*ADIF record 2/)
      assert.match(error.message, detail)
      assert.match(error.message, /QRZ COUNT=2, ADIF length=\d+ UTF-16 units/)
      assert.doesNotMatch(error.message, new RegExp(value))
      return true
    })
  }
})

test("the API key is removed from a pull failure reason", async () => {
  answer = (params) => status(params) ?? "RESULT=FAIL&REASON=Key+KEY-A+expired"
  await assert.rejects(pullLogbook(), /Key \[redacted\] expired/)
})

test("an explicit no-match reply is empty and still uses the modification date", async () => {
  calls = []
  answer = (params) => status(params) ?? "RESULT=FAIL&REASON=no+log+entries+found&COUNT=0"
  const result = await pullLogbook("2026-11-20")
  assert.equal(calls.find((sent) => sent.ACTION === "FETCH")?.OPTION, "TYPE:ADIF,MAX:250,AFTERLOGID:0,MODSINCE:2026-11-20")
  assert.equal(result.content, "<EOH>\n")
})

test("an empty success is distinct from an unexplained incremental failure", async () => {
  answer = (params) => status(params) ?? "RESULT=OK&COUNT=0"
  assert.equal((await pullLogbook()).content, "<EOH>\n")
  answer = (params) => status(params) ?? "RESULT=FAIL&COUNT=0"
  await assert.rejects(pullLogbook("2026-11-20"), /page 1 .*FAIL, COUNT=0/)
})

test("a pull from a logbook no key opens says why rather than bringing nothing", async () => {
  answer = (params) => status(params) ?? "RESULT=OK"
  await assert.rejects(qrz.runHook("transfer", "pull", { service: "qrz", destination: { id: "K9ZZ" } }), /K9ZZ/)
})
