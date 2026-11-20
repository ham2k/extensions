// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The pane as a scene: the contest and its category, where posting stands in
// a few words at the top right, and the board's columns up to Last for the
// stations around the operator's, calls in the app's monospace font, drawn in
// the placement's theme.
//
// A pane too narrow for every column drops the multipliers, then Last, then
// QSO. It shows as many rows as it has room for, the operator's in the
// middle where the board's ends allow, and the top ones when the operator is
// not on the board.

import type { PanelEnvironment, PanelScene, PanelSceneLayer } from "@ham2k/extension-sdk"
import { themePalette } from "@ham2k/lib-panel-themes"
import type { PanelColors } from "@ham2k/lib-panel-themes"

import type { BoardRow, Neighborhood } from "./scoreboard.ts"

type Role = { fontFamily: string | null; fontSize: number; scaledFontSize?: number }
export type SceneEnvironment = Pick<PanelEnvironment, "width" | "height"> & {
  typography: Record<"body" | "label", Role> & { mono?: Role }
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
  /// The contest's name, and the category shown, after it.
  title?: string
  category?: string
  /// The stations around the operator's, with the column titles.
  view?: Neighborhood
  columns?: { call: string; score: string; qsos: string; last: string }
  /// A sentence in place of the table: no contest, no board, a failure.
  message?: string
  /// Where posting or the board stands, in a few words; `alert` when
  /// something keeps the score from the board, or the board from the pane.
  status: { text: string; alert: boolean }
}

const PAD = 8
/// At most this many rows, however tall the pane, and fewer when a board
/// has many columns: the app takes 512 layers in a scene, a row is a layer
/// per column, and the title, status and header take the rest.
const MOST_ROWS = 50
const MOST_LAYERS = 512
const LAYERS_BESIDE_ROWS = 32
const GAP = 10
/// How much of the primary color the operator's row takes as a band.
const OWN_ROW_BAND = 0.32

/// Roughly how wide a line of text runs, for laying out columns and placing
/// the category after the title: the app measures nothing for a scene, so
/// text is sized by the widths its letters have in Roboto, the app's
/// sans-serif font on every platform, rounded up; or in Roboto Mono, where
/// every letter is 0.6 em.
export function textWidth(text: string, size: number, bold = false, mono = false): number {
  if (mono) return Math.ceil([...text].length * 0.6 * size)
  let ems = 0
  for (const char of text) {
    if (/[0-9]/.test(char)) ems += 0.57
    else if (char === "I") ems += 0.28
    else if (/[MW]/.test(char)) ems += 0.89
    else if (/[A-Z]/.test(char)) ems += 0.65
    else if (/[ijl]/.test(char)) ems += 0.25
    else if (/[frt]/.test(char)) ems += 0.35
    else if (/[mw]/.test(char)) ems += 0.88
    else if (/[a-z]/.test(char)) ems += 0.55
    else if (char === " ") ems += 0.26
    else if (/[.,:;'|!]/.test(char)) ems += 0.27
    else if (char === "-") ems += 0.3
    else if (/[/()]/.test(char)) ems += 0.36
    else ems += 0.6
  }
  return Math.ceil(ems * size * (bold ? 1.03 : 1))
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

/// [ownRowBand] draws the operator's row on a deeper band of the primary
/// color with its text in the ink, rather than on a light tint with its text
/// in the primary color.
export function scoreboardScene(content: SceneContent, env: SceneEnvironment, c: PanelColors, ownRowBand = false): PanelScene {
  const { width, height } = env
  const { body, label } = env.typography
  const scaled = (role: Role) => role.scaledFontSize ?? role.fontSize
  const font = (role: Role) => (role.fontFamily ? { fontFamily: role.fontFamily } : {})
  // Calls in the monospace family at the body's size, so a row's cells line up.
  const mono: Role = { ...body, fontFamily: env.typography.mono?.fontFamily ?? body.fontFamily }
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

  // Top: where posting stands at the right, and the contest in bold with its
  // category after it, as one line of text. The app has no text of mixed
  // weights, so they are two layers, the category starting a space past
  // where the title's width is estimated to end; where both do not fit, the
  // category goes on a line of its own.
  let y = PAD
  const status = content.status.text
  const statusWidth = status ? Math.min(Math.ceil(inner / 2), Math.ceil(textWidth(status, scaled(label)) * 1.08)) : 0
  if (status) {
    text("status", width - PAD - statusWidth, y + (bodyLine - labelLine) / 2, statusWidth, labelLine, status, label, {
      color: content.status.alert ? c.error : c.onSurfaceVariant,
      align: "end",
    })
  }
  const beside = inner - (status ? statusWidth + GAP : 0)
  if (content.title) {
    text("title", PAD, y, beside, bodyLine, content.title, body, { color: c.onSurface, bold: true })
    if (content.category) {
      const after = textWidth(content.title, scaled(body), true) + Math.ceil(scaled(body) * 0.26)
      if (after + textWidth(content.category, scaled(body)) <= beside) text("category", PAD + after, y, beside - after, bodyLine, content.category, body, { color: c.onSurface })
      else {
        y += bodyLine
        text("category", PAD, y, inner, bodyLine, content.category, body, { color: c.onSurface })
      }
    }
  }
  if (content.title || status) y += bodyLine + 6

  // A sentence takes as many lines as it needs, each a layer of its own:
  // a text layer is one line, cut short with an ellipsis.
  const paragraph = (id: string, top: number, literal: string, role: Role, lineHeight: number, color: string, most: number) => {
    const lines = wrapLines(literal, scaled(role), inner, most)
    lines.forEach((line, index) => text(index ? `${id}-${index}` : id, PAD, top + index * lineHeight, inner, lineHeight, line, role, { color }))
  }
  const room = height - PAD - y

  if (content.message || !content.view || !content.columns) {
    paragraph("message", y, content.message ?? "", body, bodyLine, c.onSurface, Math.max(1, Math.floor(room / bodyLine)))
    return { version: 1, width, height, values: {}, layers, controls: [] }
  }

  // The table: a header row, then the rows that fit.
  const view = content.view
  const names = content.columns
  const headerHeight = Math.ceil(scaled(label) * 1.6)
  const columnCount = 5 + view.category.multLabels.length
  const mostRows = Math.min(MOST_ROWS, Math.floor((MOST_LAYERS - LAYERS_BESIDE_ROWS - columnCount) / columnCount))
  // As many rows as fit at a little over a line each, sharing the room
  // between them up to their usual height: what a row would leave empty at
  // the bottom shows another instead. Fewer rows than that keep the usual
  // height, and the room under them.
  const rowRoom = room - headerHeight
  const shown = visibleRows(view, Math.min(mostRows, Math.floor(rowRoom / Math.ceil(scaled(body) * 1.4))))
  const rowHeight = Math.max(bodyLine, Math.min(Math.ceil(scaled(body) * 1.55), Math.floor(rowRoom / shown.rows.length)))
  // An estimate runs short now and then; a column a little wider than its
  // longest text keeps it from being cut short.
  const widest = (title: string, cell: (row: BoardRow) => string, monospace: boolean) =>
    Math.ceil(1.08 * Math.max(textWidth(title, scaled(label)), ...shown.rows.map((row) => textWidth(cell(row), scaled(body), true, monospace))))
  const column = (key: string, title: string, align: Align, cell: (row: BoardRow) => string, monospace = false): Column => ({
    key,
    title,
    align,
    cell,
    width: widest(title, cell, monospace),
  })
  const all: Column[] = [
    column("rank", "#", "end", (row) => row.rank),
    // Sized for the call alone: a guest operator's call after it is cut
    // short before a column is dropped for it.
    { ...column("call", names.call, "start", (row) => row.call, true), flex: true },
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
  const callNeeds = Math.max(...shown.rows.map((row) => textWidth(row.label, scaled(body), true, true)), textWidth("WW9WWW/9", scaled(body), true, true))
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
    if (mine) art += `<rect x="${PAD - 4}" y="${top}" width="${inner + 8}" height="${rowHeight}" rx="4" fill="${c.primary}" fill-opacity="${ownRowBand ? OWN_ROW_BAND : 0.16}"/>`
    else if (index % 2 === 1) art += `<rect x="${PAD - 4}" y="${top}" width="${inner + 8}" height="${rowHeight}" fill="${c.surfaceContainer}" fill-opacity="0.5"/>`
    columns.forEach((each, at) => {
      // A score the station has not updated lately is greyed, as on the
      // board; the operator's own row is in the theme's primary color, or on a band of it.
      const stale = !row.fresh && (each.key === "score" || each.key === "last")
      const color = mine ? (ownRowBand ? c.onSurface : c.primary) : stale || each.key === "rank" ? c.onSurfaceVariant : c.onSurface
      const cellText = each.key === "call" ? row.label : each.cell(row)
      text(`r${index}-${each.key}`, xs[at], top + (rowHeight - bodyLine) / 2, each.width, bodyLine, cellText, each.key === "call" ? mono : body, {
        color,
        bold: mine || each.key === "call",
        align: each.align,
      })
    })
  })
  layers.splice(1, 0, { id: "table", x: 0, y: 0, width, height, svg: svg(width, height, art) })
  return { version: 1, width, height, values: {}, layers, controls: [] }
}
