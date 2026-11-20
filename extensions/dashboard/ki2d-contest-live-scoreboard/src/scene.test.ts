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
const status = { text: "posted at 20:05z", alert: false }
const texts = (content: SceneContent, width = 360, height = 320, colors = FALLBACK_COLORS, ownRowBand = false) =>
  scoreboardScene(content, { ...FALLBACK_ENVIRONMENT, width, height }, colors, ownRowBand).layers.filter((layer) => layer.text)

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

test("the operator's row is bold in the primary color, or on a deeper band of it where that is close to the ink", () => {
  const content = { title: "CQ WW CW", category: "SO-ALL HP CW", view: view(4), columns, status }
  const tinted = texts(content, 400, 320, FALLBACK_COLORS)
  const mine = tinted.find((layer) => layer.id === "r4-call")!
  assert.equal(mine.text?.color, FALLBACK_COLORS.primary)
  assert.equal(mine.text?.fontWeight, 700)
  assert.equal(tinted.find((layer) => layer.id === "r3-score")?.text?.color, FALLBACK_COLORS.onSurface)

  // Teal's primary is a dark ink beside its black: text in it reads no
  // stronger than the others', so a deeper band sets the row apart and its
  // text stays black.
  const teal = themeColors("teal", FALLBACK_COLORS)
  const opacityOf = (ownRowBand: boolean) => {
    const svg = scoreboardScene(content, { ...FALLBACK_ENVIRONMENT, width: 400, height: 320 }, teal, ownRowBand).layers.find((layer) => layer.id === "table")?.svg ?? ""
    return Number(svg.match(new RegExp(`rx="4" fill="${teal.primary}" fill-opacity="([0-9.]+)"`))?.[1])
  }
  const banded = texts(content, 400, 320, teal, true)
  assert.equal(banded.find((layer) => layer.id === "r4-call")?.text?.color, teal.onSurface)
  assert.equal(banded.find((layer) => layer.id === "r4-call")?.text?.fontWeight, 700)
  assert.ok(opacityOf(true) > opacityOf(false), "a deeper band than the tint")
  assert.ok(opacityOf(true) < 1, "not a solid one")
})

test("posting's state sits in the top right corner, red when refused, and nothing goes under the table", () => {
  const layers = texts({ message: "Nobody has posted a score yet.", status: { text: "refused at 20:05z", alert: true } })
  const corner = layers.find((layer) => layer.id === "status")!
  assert.equal(corner.text?.color, FALLBACK_COLORS.error)
  assert.equal(corner.text?.align, "end")
  assert.equal(corner.x + corner.width, 360 - 8)
  const message = layers.find((layer) => layer.id === "message")!
  assert.equal(message.text?.literal, "Nobody has posted a score yet.")
  assert.ok(message.y >= corner.y + corner.height, "the sentence starts below the corner's line")
  assert.ok(!layers.some((layer) => layer.id.startsWith("head-")))

  const table = texts({ title: "CQ WW CW", view: view(4, 3), columns, status })
  const lowest = Math.max(...table.filter((layer) => /^r\d+-/.test(layer.id)).map((layer) => layer.y))
  assert.ok(table.filter((layer) => layer.id !== "status").every((layer) => layer.y <= lowest), "the last row is the lowest line")
})

test("the category follows the contest on its line, not bold, or takes a line of its own", () => {
  const top = (width: number) => texts({ title: "CQ WW CW", category: "SO-ALL HP CW", view: view(4), columns, status }, width)
  const wide = top(480)
  const title = wide.find((layer) => layer.id === "title")!
  const category = wide.find((layer) => layer.id === "category")!
  assert.equal(title.text?.fontWeight, 700)
  assert.equal(category.text?.fontWeight, undefined)
  assert.equal(category.y, title.y)
  assert.ok(category.x > title.x)
  const corner = wide.find((layer) => layer.id === "status")!
  assert.ok(category.x + category.width <= corner.x, "the category stops short of the corner")

  const narrow = top(220)
  assert.ok(narrow.find((layer) => layer.id === "category")!.y > narrow.find((layer) => layer.id === "title")!.y)
})

test("calls are drawn in the app's monospace font, and nothing else is", () => {
  const env = { ...FALLBACK_ENVIRONMENT, typography: { ...FALLBACK_ENVIRONMENT.typography, mono: { fontFamily: "RobotoMono", fontSize: 13 } } }
  const layers = scoreboardScene({ title: "CQ WW CW", view: view(4), columns, status }, env, FALLBACK_COLORS).layers
  const call = layers.find((layer) => layer.id === "r4-call")!
  assert.equal(call.text?.fontFamily, "RobotoMono")
  assert.equal(call.text?.size, FALLBACK_ENVIRONMENT.typography.body.fontSize, "at the row's size")
  assert.equal(layers.find((layer) => layer.id === "r4-score")?.text?.fontFamily, undefined)
  assert.equal(layers.find((layer) => layer.id === "head-call")?.text?.fontFamily, undefined)
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

test("rows fill the pane: what is left under the last is less than another row would take", () => {
  const many = view(30, 120)
  for (let height = 160; height <= 700; height += 7) {
    const layers = texts({ title: "CQ WW CW", category: "SO-ALL HP CW", view: many, columns, status }, 360, height)
    const rows = layers.filter((layer) => /^r\d+-rank$/.test(layer.id))
    const pitch = rows[1].y - rows[0].y
    const bottom = rows[rows.length - 1].y + rows[rows.length - 1].height + (pitch - rows[0].height) / 2
    assert.ok(height - 8 - bottom < Math.ceil(14 * 1.4), `${height - 8 - bottom}px left empty under ${rows.length} rows in a pane ${height}px tall`)
  }
  // A category shorter than the pane keeps its rows at their usual height.
  const few = texts({ title: "CQ WW CW", view: view(1, 3), columns, status }, 360, 600).filter((layer) => /^r\d+-rank$/.test(layer.id))
  assert.equal(few[1].y - few[0].y, Math.ceil(14 * 1.55))
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
