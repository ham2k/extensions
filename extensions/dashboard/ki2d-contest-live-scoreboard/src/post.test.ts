// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict"
import { test } from "node:test"

import { bandModeCounts, basicAuth, cabrilloHeaders, opsOf, readAnswer, scoreClass, scoreXml } from "./post.ts"

const LOG = `START-OF-LOG: 3.0
CONTEST: CQ-WW-CW
CALLSIGN: KI2D
OPERATORS: KI2D N2XYZ
CATEGORY-OPERATOR: MULTI-OP
CATEGORY-TRANSMITTER: ONE
CATEGORY-ASSISTED: ASSISTED
CATEGORY-POWER: HIGH
CATEGORY-BAND: ALL
CATEGORY-MODE: CW
CLUB: Frankford Radio Club
SOAPBOX: first line
SOAPBOX: second line
QSO:  14025 CW 2026-11-28 0001 KI2D 599 05 DL1ABC 599 14
END-OF-LOG:
`

test("a Cabrillo header reads up to the first QSO, repeated tags joined", () => {
  const headers = cabrilloHeaders(LOG)
  assert.equal(headers.CONTEST, "CQ-WW-CW")
  assert.equal(headers.CLUB, "Frankford Radio Club")
  assert.equal(headers.SOAPBOX, "first line second line")
  assert.equal(headers.QSO, undefined)
})

test("the categories map onto the board's class", () => {
  assert.deepEqual(scoreClass(cabrilloHeaders(LOG)), {
    power: "HIGH",
    assisted: "ASSISTED",
    transmitter: "ONE",
    ops: "MULTI-OP",
    bands: "ALL",
    mode: "CW",
    overlay: "N/A",
  })
  const sparse = scoreClass({ "CATEGORY-MODE": "SSB", "CATEGORY-BAND": "432", "CATEGORY-TRANSMITTER": "LIMITED", "CATEGORY-OVERLAY": "ROOKIE" })
  assert.deepEqual(sparse, {
    power: "LOW",
    assisted: "NON-ASSISTED",
    transmitter: "TWO",
    ops: "SINGLE-OP",
    bands: "0.70M",
    mode: "PH",
    overlay: "ROOKIE",
  })
  assert.equal(scoreClass({ "CATEGORY-BAND": "20M" }).bands, "20M")
  assert.equal(scoreClass({ "CATEGORY-MODE": "MIXED" }).mode, "MIXED")
})

test("the operators are calls only, comma-separated, the station's call when none are named", () => {
  assert.equal(opsOf({ OPERATORS: "KI2D N2XYZ @K2HOST" }, "KI2D"), "KI2D,N2XYZ,K2HOST")
  assert.equal(opsOf({}, "ki2d"), "KI2D")
})

test("the breakdown counts the log's contacts by band and mode, leaving out deletions and events", () => {
  const counts = bandModeCounts([
    { band: "20m", mode: "CW" },
    { band: "20m", mode: "CW" },
    { band: "40m", mode: "USB" },
    { band: "70cm", mode: "FM" },
    { band: "20m", mode: "CW", deleted: true },
    { band: "event", mode: "CW" },
  ])
  assert.deepEqual(counts, [
    { band: "40", mode: "PH", count: 1 },
    { band: "20", mode: "CW", count: 2 },
    { band: "0.70", mode: "PH", count: 1 },
  ])
})

test("the posted document carries the contest, class, QTH, summary lines and score", () => {
  const xml = scoreXml({
    contestId: "CQ-WW-CW",
    call: "ki2d",
    headers: cabrilloHeaders(LOG),
    totals: { score: 12_345, qsos: 3, points: 7, mults: 5 },
    multType: "country",
    qsos: [{ band: "20m", mode: "CW" }, { band: "40m", mode: "CW" }, { band: "40m", mode: "CW" }],
    qth: { dxcc: "K", cqZone: 5, ituZone: 8, grid: "FN30as" },
    soft: "Ham2K Logger",
    version: "0.1.0",
    now: Date.UTC(2026, 10, 28, 12, 5, 0),
  })
  assert.equal(
    xml,
    [
      '<?xml version="1.0"?>',
      "<dynamicresults>",
      "<contest>CQ-WW-CW</contest>",
      "<call>KI2D</call>",
      "<ops>KI2D,N2XYZ</ops>",
      '<class power="HIGH" assisted="ASSISTED" transmitter="ONE" ops="MULTI-OP" bands="ALL" mode="CW" overlay="N/A"></class>',
      "<club>Frankford Radio Club</club>",
      "<soft>Ham2K Logger</soft>",
      "<version>0.1.0</version>",
      "<qth>",
      "<dxcccountry>K</dxcccountry>",
      "<cqzone>5</cqzone>",
      "<iaruzone>8</iaruzone>",
      "<grid6>FN30as</grid6>",
      "</qth>",
      "<breakdown>",
      '<qso band="40" mode="CW">2</qso>',
      '<qso band="20" mode="CW">1</qso>',
      '<qso band="total" mode="ALL">3</qso>',
      '<point band="total" mode="ALL">7</point>',
      '<mult band="total" mode="ALL" type="country">5</mult>',
      "</breakdown>",
      "<score>12345</score>",
      "<timestamp>2026-11-28 12:05:00</timestamp>",
      "</dynamicresults>",
    ].join("\n"),
  )
})

test("text is escaped, and a contest with no multipliers sends no mult line", () => {
  const xml = scoreXml({
    contestId: "ARRL-FIELD-DAY",
    call: "W1AW",
    headers: { CLUB: "Ham & <Eggs>" },
    totals: { score: 10 },
    qsos: [{ band: "20m", mode: "SSB" }],
    qth: { grid: "FN31" },
    soft: "Ham2K Logger",
    version: "0.1.0",
    now: 0,
  })
  assert.match(xml, /<club>Ham &amp; &lt;Eggs&gt;<\/club>/)
  assert.match(xml, /<grid4>FN31<\/grid4>/)
  assert.match(xml, /<qso band="total" mode="ALL">1<\/qso>/)
  assert.doesNotMatch(xml, /<mult|<point/)
})

test("the board's answer is read from its JSON, however it is wrapped", () => {
  assert.deepEqual(readAnswer(200, '{"status":200,"status_message":"OK-Full"}'), { ok: true, status: 200, message: "OK-Full" })
  assert.deepEqual(readAnswer(200, '<p>{“status”:404,“status_message”:“Error! Contest is closed or is not valid”}</p>'), {
    ok: false,
    status: 404,
    message: "Error! Contest is closed or is not valid",
    closed: true,
  })
  assert.deepEqual(readAnswer(401, "Unauthorized"), { ok: false, status: 401, message: "HTTP 401", auth: true })
  assert.equal(readAnswer(200, '{"status":403,"status_message":"Wrong password"}').auth, true)
  // A server or gateway failing is not the board refusing.
  assert.deepEqual(readAnswer(502, "<html><body>Bad Gateway</body></html>"), { ok: false, status: 502, message: "HTTP 502", transient: true })
  assert.equal(readAnswer(429, "").transient, true)
  assert.deepEqual(readAnswer(200, '{"status":503,"status_message":"Database busy"}'), { ok: false, status: 503, message: "Database busy", transient: true })
})

test("basic authentication encodes the call and password", () => {
  assert.equal(basicAuth("KI2D", "secret"), `Basic ${Buffer.from("KI2D:secret").toString("base64")}`)
  assert.equal(basicAuth("KI2D", "pässwörd!"), `Basic ${Buffer.from("KI2D:pässwörd!").toString("base64")}`)
  assert.equal(basicAuth("A", "b"), `Basic ${Buffer.from("A:b").toString("base64")}`)
})
