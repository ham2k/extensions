// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The pane as a scene: the contest and category, the board's columns up to
// Last for the stations around the operator's, and a line saying where
// posting stands, drawn in the placement's theme.
//
// A pane too narrow for every column drops the multipliers, then Last, then
// QSO. It shows as many rows as it has room for, the operator's in the
// middle where the board's ends allow, and the top ones when the operator is
// not on the board. The lines under the table follow it, so a tall
// pane leaves its room at the bottom.

import type { PanelEnvironment, PanelScene, PanelSceneLayer } from "@ham2k/extension-sdk"
import { themePalette } from "@ham2k/lib-panel-themes"
import type { PanelColors } from "@ham2k/lib-panel-themes"

import type { BoardRow, Neighborhood } from "./scoreboard.ts"

type Role = { fontFamily: string | null; fontSize: number; scaledFontSize?: number }
export type SceneEnvironment = Pick<PanelEnvironment, "width" | "height"> & {
  typography: Record<"body" | "label", Role>
}

/// For a host that sends no environment.
export const FALLBACK_ENVIRONMENT: SceneEnvironment = {
  width: 360,
  height: 280,
  typography: { body: { fontFamily: null, fontSize: 14 }, label: { fontFamily: null, fontSize: 12 } },
}

/// The colors to draw with when the app gives none.
export const FALLBACK_COLORS: PanelColors = themePalette("light")

export interface SceneContent {
  /// The contest's name, and the category shown.
  title?: string
  category?: string
  /// The stations around the operator's, with the column titles.
  view?: Neighborhood
  columns?: { call: string; score: string; qsos: string; last: string }
  /// A sentence in place of the table: no contest, no board, a failure.
  message?: string
  /// A line under the table: the operator not on the board yet.
  note?: string
  /// Where posting stands; `alert` when it was refused or failed.
  status: { text: string; alert: boolean }
}

const PAD = 8
/// At most this many rows, however tall the pane, and fewer when a board
/// has many columns: the app takes 512 layers in a scene, a row is a layer
/// per column, and the title, header and lines under the table take the rest.
const MOST_ROWS = 50
const MOST_LAYERS = 512
const LAYERS_BESIDE_ROWS = 32
const GAP = 10

/// Roughly how wide a line of text runs, for laying out columns: the app
/// measures nothing for a scene, so a column is sized from its longest
/// text by the widths these letters have in the app's sans-serif fonts.
export function textWidth(text: string, size: number, bold = false): number {
  let ems = 0
  for (const char of text) {
    if (/[0-9]/.test(char)) ems += 0.57
    else if (/[A-Z]/.test(char)) ems += 0.67
    else if (/[a-z]/.test(char)) ems += 0.53
    else if (char === " ") ems += 0.26
    else if (/[.,:;'|!]/.test(char)) ems += 0.27
    else ems += 0.6
  }
  return Math.ceil(ems * size * (bold ? 1.06 : 1))
}

/// [literal] broken into lines no wider than [width] at [size], word by
/// word, at most [most] of them, the last cut short with an ellipsis when
/// the words run past it. A word longer than a line has one to itself.
export function wrapLines(literal: string, size: number, width: number, most: number): string[] {
  const fits = (line: string) => textWidth(line, size) * 1.08 <= width
  const lines: string[] = []
  let line = ""
  for (const word of literal.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (fits(longer) || !line) line = longer
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= most) return lines
  const kept = lines.slice(0, most)
  kept[most - 1] = `${kept[most - 1]}…`
  return kept
}

type Align = "start" | "center" | "end"
interface Column {
  key: string
  title: string
  align: Align
  cell: (row: BoardRow) => string
  width: number
  flex?: boolean
}

/// The rows a pane `fits` rows high shows: all of them when they fit,
/// otherwise as many with the operator's row as near the middle as the
/// board's ends allow, or the top ones when the operator is not on it.
export function visibleRows(view: Neighborhood, fits: number): { rows: BoardRow[]; at: number } {
  const count = Math.max(1, Math.min(fits, view.rows.length))
  if (count >= view.rows.length) return { rows: view.rows, at: view.at }
  if (view.at < 0) return { rows: view.rows.slice(0, count), at: -1 }
  const start = Math.max(0, Math.min(view.at - Math.floor((count - 1) / 2), view.rows.length - count))
  return { rows: view.rows.slice(start, start + count), at: view.at - start }
}

/// The columns that fit `width`: the multipliers go first, from the last,
/// then Last, then QSO. The call's column takes what is left over.
export function fitColumns(columns: Column[], width: number): Column[] {
  const kept = [...columns]
  const needed = () => kept.reduce((sum, column) => sum + column.width, 0) + GAP * (kept.length - 1)
  const dropOrder = [...kept.filter((column) => column.key.startsWith("mult")).reverse().map((column) => column.key), "last", "qsos"]
  for (const key of dropOrder) {
    if (needed() <= width) break
    const index = kept.findIndex((column) => column.key === key)
    if (index >= 0) kept.splice(index, 1)
  }
  return kept
}

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`

export function scoreboardScene(content: SceneContent, env: SceneEnvironment, c: PanelColors): PanelScene {
  const { width, height } = env
  const { body, label } = env.typography
  const scaled = (role: Role) => role.scaledFontSize ?? role.fontSize
  const font = (role: Role) => (role.fontFamily ? { fontFamily: role.fontFamily } : {})
  const bodyLine = Math.ceil(scaled(body) * 1.35)
  const labelLine = Math.ceil(scaled(label) * 1.35)
  const inner = Math.max(40, width - 2 * PAD)

  const layers: PanelSceneLayer[] = [{ id: "background", x: 0, y: 0, width, height, svg: svg(width, height, `<rect width="${width}" height="${height}" fill="${c.surface}"/>`) }]
  const text = (id: string, x: number, y: number, w: number, h: number, literal: string, role: Role, options: { color: string; bold?: boolean; align?: Align }) => {
    layers.push({
      id,
      x,
      y,
      width: Math.max(1, w),
      height: h,
      text: { literal, size: role.fontSize, color: options.color, ...(options.bold ? { fontWeight: 700 } : {}), ...(options.align ? { align: options.align } : {}), ...font(role) },
    })
  }

  // Top: the contest, and the category beside it, or under it when the
  // two do not fit on one line.
  let y = PAD
  if (content.title) {
    const titleWidth = textWidth(content.title, scaled(body), true)
    const categoryWidth = content.category ? textWidth(content.category, scaled(label)) : 0
    const oneLine = !content.category || titleWidth + GAP + categoryWidth <= inner
    text("title", PAD, y, oneLine && content.category ? inner - categoryWidth - GAP : inner, bodyLine, content.title, body, { color: c.onSurface, bold: true })
    if (content.category) {
      if (oneLine) text("category", width - PAD - categoryWidth, y + (bodyLine - labelLine) / 2, categoryWidth, labelLine, content.category, label, { color: c.onSurfaceVariant, align: "end" })
      else text("category", PAD, y + bodyLine, inner, labelLine, content.category, label, { color: c.onSurfaceVariant })
    }
    y += bodyLine + (oneLine ? 0 : labelLine) + 6
  }

  // A sentence takes as many lines as it needs, each a layer of its own:
  // a text layer is one line, cut short with an ellipsis.
  const paragraph = (id: string, top: number, literal: string, role: Role, lineHeight: number, color: string, most: number) => {
    const lines = wrapLines(literal, scaled(role), inner, most)
    lines.forEach((line, index) => text(index ? `${id}-${index}` : id, PAD, top + index * lineHeight, inner, lineHeight, line, role, { color }))
    return lines.length * lineHeight
  }
  const lineCount = (literal: string | undefined, role: Role, most: number) => (literal ? wrapLines(literal, scaled(role), inner, most).length : 0)

  // Under the table, or the sentence in its place: the note, then where
  // posting stands. Each takes the lines it needs, and the rows give way.
  const footerHeight = (lineCount(content.note, label, 2) + lineCount(content.status.text, label, 3)) * labelLine + (content.note ? 2 : 0)
  const footer = (top: number) => {
    if (content.note) top += paragraph("note", top, content.note, label, labelLine, c.onSurfaceVariant, 2) + 2
    paragraph("status", top, content.status.text, label, labelLine, content.status.alert ? c.error : c.onSurfaceVariant, 3)
  }
  const room = height - PAD - footerHeight - 6 - y

  if (content.message || !content.view || !content.columns) {
    const messageHeight = paragraph("message", y, content.message ?? "", body, bodyLine, c.onSurface, Math.max(1, Math.floor(room / bodyLine)))
    footer(y + messageHeight + 8)
    return { version: 1, width, height, values: {}, layers, controls: [] }
  }

  // The table: a header row, then the rows that fit.
  const view = content.view
  const names = content.columns
  const rowHeight = Math.ceil(scaled(body) * 1.55)
  const headerHeight = Math.ceil(scaled(label) * 1.6)
  const columnCount = 5 + view.category.multLabels.length
  const mostRows = Math.min(MOST_ROWS, Math.floor((MOST_LAYERS - LAYERS_BESIDE_ROWS - columnCount) / columnCount))
  const shown = visibleRows(view, Math.min(mostRows, Math.floor((room - headerHeight) / rowHeight)))
  // An estimate runs short now and then; a column a little wider than its
  // longest text keeps it from being cut short.
  const widest = (title: string, cell: (row: BoardRow) => string) =>
    Math.ceil(1.08 * Math.max(textWidth(title, scaled(label)), ...shown.rows.map((row) => textWidth(cell(row), scaled(body), true))))
  const column = (key: string, title: string, align: Align, cell: (row: BoardRow) => string): Column => ({ key, title, align, cell, width: widest(title, cell) })
  const all: Column[] = [
    column("rank", "#", "end", (row) => row.rank),
    // Sized for the call alone: a guest operator's call after it is cut
    // short before a column is dropped for it.
    { ...column("call", names.call, "start", (row) => row.call), flex: true },
    column("score", names.score, "end", (row) => row.score),
    column("qsos", names.qsos, "end", (row) => row.qsos),
    ...view.category.multLabels.map((title, index) => column(`mult${index}`, title, "end", (row) => row.mults[index] ?? "")),
    column("last", names.last, "center", (row) => row.last),
  ]
  const columns = fitColumns(all, inner)
  const spare = inner - columns.reduce((sum, each) => sum + each.width, 0) - GAP * (columns.length - 1)
  // What is left goes to the call, and past what a call needs, between
  // the numbers, so a wide pane spreads them rather than leaving a gap.
  const callColumn = columns.find((each) => each.flex)!
  const callNeeds = Math.max(...shown.rows.map((row) => textWidth(row.label, scaled(body), true)), textWidth("WW9WWW/9", scaled(body), true))
  const toCall = Math.max(0, Math.min(spare, callNeeds - callColumn.width + 3 * GAP))
  callColumn.width += toCall
  const spread = Math.max(0, spare - toCall) / Math.max(1, columns.length - 1)
  const xs: number[] = []
  let x = PAD
  for (const each of columns) {
    xs.push(x)
    x += each.width + GAP + spread
  }

  let art = `<rect x="${PAD}" y="${y + headerHeight - 1}" width="${inner}" height="1" fill="${c.outlineVariant}"/>`
  columns.forEach((each, index) => {
    text(`head-${each.key}`, xs[index], y + (headerHeight - labelLine) / 2, each.width, labelLine, each.title, label, { color: c.onSurfaceVariant, align: each.align })
  })
  y += headerHeight
  shown.rows.forEach((row, index) => {
    const top = y + index * rowHeight
    const mine = index === shown.at
    if (mine) art += `<rect x="${PAD - 4}" y="${top}" width="${inner + 8}" height="${rowHeight}" rx="4" fill="${c.primary}" fill-opacity="0.16"/>`
    else if (index % 2 === 1) art += `<rect x="${PAD - 4}" y="${top}" width="${inner + 8}" height="${rowHeight}" fill="${c.surfaceContainer}" fill-opacity="0.5"/>`
    columns.forEach((each, at) => {
      // A score the station has not updated lately is greyed, as on the
      // board; the operator's own row is in the theme's primary color.
      const stale = !row.fresh && (each.key === "score" || each.key === "last")
      const color = mine ? c.primary : stale || each.key === "rank" ? c.onSurfaceVariant : c.onSurface
      const cellText = each.key === "call" ? row.label : each.cell(row)
      text(`r${index}-${each.key}`, xs[at], top + (rowHeight - bodyLine) / 2, each.width, bodyLine, cellText, body, {
        color,
        bold: mine || each.key === "call",
        align: each.align,
      })
    })
  })
  footer(y + shown.rows.length * rowHeight + 6)
  layers.splice(1, 0, { id: "table", x: 0, y: 0, width, height, svg: svg(width, height, art) })
  return { version: 1, width, height, values: {}, layers, controls: [] }
}
