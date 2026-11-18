// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict"
import { test } from "node:test"

import { themeColors } from "@ham2k/lib-panel-themes"

import { FALLBACK_COLORS, FALLBACK_ENVIRONMENT, scoreboardScene, visibleRows, wrapLines } from "./scene.ts"
import type { SceneContent } from "./scene.ts"
import type { BoardRow, Neighborhood } from "./scoreboard.ts"

const row = (rank: number, call = `K${rank}X`): BoardRow => ({ rank: String(rank), label: call, call, score: "1,000", qsos: "100", mults: ["40", "12"], last: "00:03", fresh: true })

function view(at: number, count = 9): Neighborhood {
  return { category: { title: "SO-ALL HP CW", multLabels: ["Countries", "Zones"], rows: [] }, rows: Array.from({ length: count }, (_, i) => row(i + 1)), at }
}

const columns = { call: "Call", score: "Score", qsos: "QSO", last: "Last" }
const status = { text: "Score posted at 20:05z.", alert: false }
const texts = (content: SceneContent, width = 360, height = 320, colors = FALLBACK_COLORS) =>
  scoreboardScene(content, { ...FALLBACK_ENVIRONMENT, width, height }, colors).layers.filter((layer) => layer.text)

test("a short pane keeps the operator's row among those it has room for", () => {
  assert.deepEqual(visibleRows(view(4), 9).rows.map((each) => each.rank), ["1", "2", "3", "4", "5", "6", "7", "8", "9"])
  const middle = visibleRows(view(4), 3)
  assert.deepEqual(middle.rows.map((each) => each.rank), ["4", "5", "6"])
  assert.equal(middle.at, 1)
  assert.deepEqual(visibleRows(view(8), 3).rows.map((each) => each.rank), ["7", "8", "9"])
  assert.deepEqual(visibleRows(view(-1), 3).rows.map((each) => each.rank), ["1", "2", "3"])
  assert.equal(visibleRows(view(4), 0).rows.length, 1, "always the operator's own row")
})

test("a narrow pane drops the multipliers first, then Last, then QSO", () => {
  const heads = (width: number) => texts({ title: "CQ WW CW", view: view(4), columns, status }, width).filter((layer) => layer.id.startsWith("head-")).map((layer) => layer.text?.literal)
  assert.deepEqual(heads(400), ["#", "Call", "Score", "QSO", "Countries", "Zones", "Last"])
  assert.deepEqual(heads(260), ["#", "Call", "Score", "QSO", "Last"])
  assert.deepEqual(heads(120), ["#", "Call", "Score"])
})

test("the operator's row is drawn bold in the theme's primary color", () => {
  const teal = themeColors("teal", FALLBACK_COLORS)
  const layers = texts({ title: "CQ WW CW", category: "SO-ALL HP CW", view: view(4), columns, status }, 400, 320, teal)
  const mine = layers.find((layer) => layer.id === "r4-call")!
  assert.equal(mine.text?.color, teal.primary)
  assert.equal(mine.text?.fontWeight, 700)
  assert.equal(layers.find((layer) => layer.id === "r3-score")?.text?.color, teal.onSurface)
})

test("a sentence stands in for the table, with posting's state under it, red when refused", () => {
  const layers = texts({ message: "Nobody has posted a score yet.", status: { text: "Score refused at 20:05z: bad password", alert: true } })
  assert.equal(layers.find((layer) => layer.id === "message")?.text?.literal, "Nobody has posted a score yet.")
  assert.equal(layers.find((layer) => layer.id === "status")?.text?.color, FALLBACK_COLORS.error)
  assert.ok(!layers.some((layer) => layer.id.startsWith("head-")))
})

test("a sentence wraps word by word, and stops with an ellipsis past its lines", () => {
  const sentence = "Add a contest to this operation to see its live scoreboard."
  const lines = wrapLines(sentence, 14, 200, 5)
  assert.ok(lines.length > 1)
  assert.equal(lines.join(" "), sentence)
  const one = wrapLines(sentence, 14, 200, 1)
  assert.equal(one.length, 1)
  assert.match(one[0], /…$/)
  assert.deepEqual(wrapLines("KI2D", 14, 10, 2), ["KI2D"])
})

test("a tall pane shows as many rows as fit, and no more than the scene can take", () => {
  const many = view(30, 120)
  const rows = (height: number) => texts({ title: "CQ WW CW", view: many, columns, status }, 360, height).filter((layer) => /^r\d+-rank$/.test(layer.id)).length
  assert.ok(rows(320) < rows(760), "a taller pane, more rows")
  assert.ok(rows(760) > 9)
  assert.equal(rows(5000), 50)
  const tall = scoreboardScene({ title: "CQ WW CW", view: many, columns, status }, { ...FALLBACK_ENVIRONMENT, width: 360, height: 5000 }, FALLBACK_COLORS)
  assert.ok(tall.layers.length <= 512)

  const labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
  const wideBoard: Neighborhood = {
    category: { title: "SO-ALL HP CW", multLabels: labels, rows: [] },
    rows: Array.from({ length: 120 }, (_, i) => ({ ...row(i + 1), mults: labels.map(() => "9") })),
    at: 30,
  }
  const huge = scoreboardScene({ title: "CQ WW CW", view: wideBoard, columns, status }, { ...FALLBACK_ENVIRONMENT, width: 1600, height: 5000 }, FALLBACK_COLORS)
  assert.ok(huge.layers.length <= 512, `${huge.layers.length} layers with ${labels.length} multiplier columns`)
})
