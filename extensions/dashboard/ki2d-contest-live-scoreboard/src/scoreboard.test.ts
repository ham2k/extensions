// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict"
import { test } from "node:test"

import { candidateOrder, contestIdFromInput, neighborhood, parseBoard, parseContestRules, rulesFor, sameContest } from "./scoreboard.ts"

/// A board page cut to the shape contestonlinescore.com serves: the picker,
/// the tool links naming the contest, and a table per category whose header
/// leaves cells unclosed.
function page(rows: number, options: { mults?: string[]; second?: boolean } = {}): string {
  const mults = options.mults ?? ["Unique Calls"]
  const header = (title: string) =>
    `<tr class="title5" style="text-align: left;"><strong><td colspan="2"> &nbsp; <a href="#">SO</a>-<a href="#">ALL</a> <a href="#">${title}</a> CW</td>` +
    `<td align="right">Score &nbsp; </td><td align="right">QSO</td>` +
    (mults.length ? mults.map((label) => `<td style="text-align: center">${label}`).join("") : `<td>No multiplier`) +
    (mults.length < 2 ? `<td ></td>` : "") +
    `<td style="text-align: center">Last</td><td></td><td></td><td></td><td><div title="Logger">Log</div></td></strong></tr>`
  const row = (rank: number, call: string, live: boolean) =>
    `<tr class="tbl${(rank % 2) + 1}" ><td style="text-align: center;">${rank}</td><td style="text-align: right;">` +
    `<a href ="/tools/rate/?call=${call}"><strong>${call}</strong></a> &nbsp; </td>` +
    `<td style='text-align: right; color:${live ? "green" : "darkgrey"};'>${(10_000 - rank * 100).toLocaleString("en")} &nbsp; </td>` +
    `<td style='text-align: right;'><strong>${200 - rank}&nbsp;</strong></td>` +
    (mults.length ? mults.map((_, i) => `<td style='text-align: center;'><strong>${50 - rank - i}</strong></td>`).join("") : `<td></td>`) +
    (mults.length < 2 ? `<td></td>` : "") +
    `<td style="text-align: center;">${live ? "00:03" : ""}</td><td align="center"></td>` +
    `<td style="text-align: left;">Some Club</td><td></td><td style="text-align: center;">N+</td></tr>`
  const table = (title: string, prefix: string) =>
    header(title) + Array.from({ length: rows }, (_, i) => row(i + 1, i === 0 ? `${prefix}1A (${prefix}2B)` : `${prefix}${i + 1}X`, i % 3 === 0)).join("")
  return `<html><body>
    <select name='contest_id' id='contest' onchange="this.form.submit()"><option value='428'  style='color: darkblue;'>Closed: K1USN Slow Speed Fri</option>
    <option value='101'  style='color: darkblue;'>Closed: WAE DX RTTY</option>
    <option value='547'   selected  style='color: red;'>On air: Tuesday&#039;s Telegraphy</option>
    <option value='34'  style='color: green;'>Coming: CWops Mini-CWT 2 </option></select>
    <a href="https://leaders.hfsignals.live/?contest=CW-Ops"  title ="Leaderboard">Leaderboard</a>
    <board><table width="1200px"><tr><td height="5px"></td></tr>${table("HP", "K")}${options.second ? table("LP", "W") : ""}
    <tr class="title_footer"><td>Terms</td></tr></table></board></body></html>`
}

test("a board reads each category's columns up to Last, and its rows", () => {
  const board = parseBoard(page(12, { second: true }))
  assert.equal(board.contestId, "CW-Ops")
  assert.equal(board.contestName, "Tuesday's Telegraphy")
  assert.deepEqual(board.categories.map((category) => category.title), ["SO-ALL HP CW", "SO-ALL LP CW"])
  const first = board.categories[0]
  assert.deepEqual(first.multLabels, ["Unique Calls"])
  assert.equal(first.rows.length, 12)
  assert.deepEqual(first.rows[0], {
    rank: "1",
    label: "K1A (K2B)",
    call: "K1A",
    score: "9,900",
    qsos: "199",
    mults: ["49"],
    last: "00:03",
    fresh: true,
  })
  assert.equal(first.rows[1].fresh, false)
  assert.equal(first.rows[1].last, "")
})

test("a contest with no multiplier shows none, and one with two shows both", () => {
  assert.deepEqual(parseBoard(page(3, { mults: [] })).categories[0].multLabels, [])
  assert.deepEqual(parseBoard(page(3, { mults: [] })).categories[0].rows[0].mults, [])
  const two = parseBoard(page(3, { mults: ["Countries", "Zones"] })).categories[0]
  assert.deepEqual(two.multLabels, ["Countries", "Zones"])
  assert.deepEqual(two.rows[0].mults, ["49", "48"])
  assert.equal(two.rows[0].last, "00:03")
})

test("the picker's contests carry their state and the one selected", () => {
  const { contests } = parseBoard(page(1))
  assert.deepEqual(
    contests.map((contest) => [contest.id, contest.state, contest.selected]),
    [["428", "closed", false], ["101", "closed", false], ["547", "onAir", true], ["34", "coming", false]],
  )
  // On the air first, then those coming, then the latest closed.
  assert.deepEqual(candidateOrder(contests).map((contest) => contest.id), ["547", "34", "101", "428"])
})

test("the window keeps four above and four below, and stays nine rows at either end", () => {
  const board = parseBoard(page(20, { second: true }))
  const middle = neighborhood(board, "W10X")!
  assert.equal(middle.category.title, "SO-ALL LP CW")
  assert.deepEqual(middle.rows.map((row) => row.rank), ["6", "7", "8", "9", "10", "11", "12", "13", "14"])
  assert.equal(middle.at, 4)

  const top = neighborhood(board, "k2x")!
  assert.deepEqual(top.rows.map((row) => row.rank), ["1", "2", "3", "4", "5", "6", "7", "8", "9"])
  assert.equal(top.at, 1)

  const bottom = neighborhood(board, "K20X")!
  assert.deepEqual(bottom.rows.map((row) => row.rank), ["12", "13", "14", "15", "16", "17", "18", "19", "20"])
  assert.equal(bottom.at, 8)

  // A guest-operated station is found by its own call.
  assert.equal(neighborhood(board, "K1A")!.at, 0)
})

test("a station not on the board sees the top of the first category", () => {
  const view = neighborhood(parseBoard(page(12)), "KI2D")!
  assert.equal(view.at, -1)
  assert.equal(view.rows.length, 9)
  assert.equal(view.rows[0].rank, "1")
})

test("the contest list gives the board's spelling and multiplier types", () => {
  const html = `<table>
    <tr align = 'center' class='tbl1' height='18px'><td>106</td><td>CQ WW CW</td><td>CQ-WW-CW</td><td>Countries</div></td><td>Zones</div></td><td>country</div></td><td>zone</div></td></tr>
    <tr align = 'center' class='tbl2' height='18px'><td>110</td><td>CWops Mini-CWT 1</td><td>CW-Ops</td><td>Unique Calls</td><td></td><td>state</td><td></td></tr>
    <tr align = 'center' class='tbl1' height='18px'><td>46</td><td>ARRL Field Day</td><td>ARRL-FIELD-DAY</td><td></td><td></td><td></td><td></td></tr>
  </table>`
  const rules = parseContestRules(html)
  assert.deepEqual(rulesFor(rules, "cq-ww-cw"), { contestId: "CQ-WW-CW", name: "CQ WW CW", multTypes: ["country", "zone"] })
  // Ham2K's exports name these two differently from the board.
  assert.equal(rulesFor(rules, "CWOPS-CWT")?.contestId, "CW-Ops")
  assert.deepEqual(rulesFor(rules, "ARRL-FD")?.multTypes, [])
  assert.equal(rulesFor(rules, "NAQP-CW"), undefined)
  assert.ok(sameContest("CW-Ops", "CWOPS-CWT"))
  assert.ok(!sameContest("CW-Ops", undefined))
})

test("a board is named by its number or its link", () => {
  assert.equal(contestIdFromInput(" 34 "), "34")
  assert.equal(contestIdFromInput("https://contestonlinescore.com/scoreboard/?contest_id=106&view=breakdown"), "106")
  assert.equal(contestIdFromInput("CQ-WW-CW"), undefined)
  assert.equal(contestIdFromInput(undefined), undefined)
})
