// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// A score as Contest Online ScoreBoard takes it: an XML document POSTed to
// `/post/` with HTTP Basic authentication, the callsign as the user name
// (https://blog.contestonlinescore.com/online-scoring-xml-specification/).
//
// What goes in comes from two places, neither of them this extension's own
// reading of the contest's rules:
//
//   * the contest's Cabrillo export, whose header already says the contest
//     (`CONTEST: CQ-WW-CW`), the categories, the club and the operators the
//     way the contest's sponsor wants them;
//   * the contest's score as the app keeps it: the total, QSOs, points and
//     multipliers its scorer reports.
//
// The per-band lines count the log's contacts by band and mode. The board
// requires the summary lines (`band="total" mode="ALL"`), which carry the
// scorer's own numbers, so its dupes and invalid contacts are not counted.

import type { JSONValue } from "@ham2k/extension-sdk"

export const POST_URL = "https://contestonlinescore.com/post/"

/// A Cabrillo log's header, `TAG: value` per line up to the first `QSO:`.
/// A tag given twice (`SOAPBOX`, `ADDRESS`) keeps its lines joined by a space.
export function cabrilloHeaders(log: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of log.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9-]*):\s?(.*)$/.exec(line.trim())
    if (!match) continue
    const [, tag, value] = match
    if (tag === "QSO" || tag === "X-QSO" || tag === "END-OF-LOG") break
    headers[tag] = headers[tag] ? `${headers[tag]} ${value.trim()}` : value.trim()
  }
  return headers
}

export interface ScoreClass {
  power: string
  assisted: string
  transmitter: string
  ops: string
  bands: string
  mode: string
  overlay: string
}

/// Cabrillo band categories the board spells its own way.
const BAND_NAMES: Record<string, string> = {
  "222": "1.25M",
  "432": "0.70M",
  "902": "0.33M",
  "1.2G": "0.23M",
  "2.3G": "0.13M",
  "3.4G": "0.09M",
}

const OVERLAYS = new Set(["TB-WIRES", "ROOKIE", "CLASSIC", "WIRE-ONLY"])

/// The board's `<class>` from the Cabrillo categories. A category the log
/// leaves out takes the most common entry: single operator, unassisted, one
/// transmitter, all bands.
export function scoreClass(headers: Record<string, string>): ScoreClass {
  const value = (tag: string) => (headers[tag] ?? "").trim().toUpperCase()

  const operator = value("CATEGORY-OPERATOR")
  const ops = operator.startsWith("MULTI") ? "MULTI-OP" : "SINGLE-OP"

  const power = value("CATEGORY-POWER")
  const assisted = value("CATEGORY-ASSISTED")

  const transmitter = value("CATEGORY-TRANSMITTER")
  const transmitters =
    transmitter === "UNLIMITED" ? "UNLIMITED" : transmitter === "TWO" || transmitter === "LIMITED" ? "TWO" : "ONE"

  const band = value("CATEGORY-BAND")
  const bands = !band || band === "ALL" ? "ALL" : BAND_NAMES[band] ?? (/^\d+(\.\d+)?M$/.test(band) ? band : "ALL")

  const mode = value("CATEGORY-MODE")
  const modes = mode === "SSB" || mode === "FM" || mode === "PH" ? "PH" : mode === "RY" ? "RTTY" : ["CW", "RTTY", "DIGI", "FT8", "FT4", "PSK"].includes(mode) ? mode : "MIXED"

  const overlay = value("CATEGORY-OVERLAY")

  return {
    power: power === "HIGH" || power === "QRP" ? power : "LOW",
    assisted: assisted === "ASSISTED" ? "ASSISTED" : "NON-ASSISTED",
    transmitter: transmitters,
    ops,
    bands,
    mode: modes,
    overlay: OVERLAYS.has(overlay) ? overlay : "N/A",
  }
}

/// A contact's band as the board's breakdown writes it: meters, no unit
/// (`20m` → `20`, `70cm` → `0.70`).
export function boardBand(band: string): string | undefined {
  const meters = /^(\d+(?:\.\d+)?)m$/i.exec(band)
  if (meters) return meters[1]
  const centimeters = /^(\d+(?:\.\d+)?)cm$/i.exec(band)
  if (centimeters) return (Number(centimeters[1]) / 100).toFixed(2)
  return undefined
}

/// A contact's mode as the board's breakdown writes it.
export function boardMode(mode: string): string {
  const upper = mode.toUpperCase()
  if (["SSB", "USB", "LSB", "AM", "FM", "PH", "PHONE"].includes(upper)) return "PH"
  if (upper === "CW" || upper === "RTTY" || upper === "FT8" || upper === "FT4" || upper === "PSK") return upper
  if (upper === "RY") return "RTTY"
  return "DIGI"
}

export interface Totals {
  score: number
  qsos?: number
  points?: number
  mults?: number
}

export interface Qth {
  dxcc?: string
  cqZone?: number
  ituZone?: number
  section?: string
  state?: string
  grid?: string
}

export interface PostInput {
  /// The contest as the board spells it (`CW-Ops`).
  contestId: string
  call: string
  headers: Record<string, string>
  totals: Totals
  /// The board's type for the contest's first multiplier (`country`), when
  /// it counts any.
  multType?: string
  qsos: Record<string, JSONValue>[]
  /// Whether to send the contacts by band and mode, or the totals alone.
  breakdown?: boolean
  qth: Qth
  soft: string
  version: string
  now: number
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/// `2026-11-17 20:05:00`, UTC.
export function timestamp(millis: number): string {
  return new Date(millis).toISOString().slice(0, 19).replace("T", " ")
}

/// The board's `<ops>`: the operators, comma-separated, calls only.
export function opsOf(headers: Record<string, string>, call: string): string {
  const operators = (headers.OPERATORS ?? "")
    .toUpperCase()
    .split(/[\s,]+/)
    .map((op) => op.replace(/^@/, ""))
    .filter((op) => /^[A-Z0-9/]+$/.test(op))
  const unique = [...new Set(operators)]
  return (unique.length ? unique : [call.toUpperCase()]).join(",").slice(0, 250)
}

/// How many of the log's contacts went out on each band and mode.
export function bandModeCounts(qsos: Record<string, JSONValue>[]): { band: string; mode: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const qso of qsos) {
    if (qso.deleted === true || typeof qso.band !== "string" || qso.band === "event") continue
    const band = boardBand(qso.band)
    if (!band) continue
    const key = `${band}|${boardMode(typeof qso.mode === "string" ? qso.mode : "")}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .map(([key, count]) => {
      const [band, mode] = key.split("|")
      return { band, mode, count }
    })
    .sort((a, b) => Number(b.band) - Number(a.band) || a.mode.localeCompare(b.mode))
}

/// The document `/post/` takes.
export function scoreXml(input: PostInput): string {
  const { headers, totals, qth } = input
  const klass = scoreClass(headers)
  const call = input.call.toUpperCase()
  const lines: string[] = ['<?xml version="1.0"?>', "<dynamicresults>"]
  const element = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return
    lines.push(`<${name}>${escape(String(value))}</${name}>`)
  }

  element("contest", input.contestId)
  element("call", call)
  element("ops", opsOf(headers, call))
  lines.push(
    `<class power="${klass.power}" assisted="${klass.assisted}" transmitter="${klass.transmitter}" ops="${klass.ops}" bands="${klass.bands}" mode="${klass.mode}" overlay="${klass.overlay}"></class>`,
  )
  element("club", headers.CLUB)
  element("soft", input.soft)
  element("version", input.version)

  lines.push("<qth>")
  element("dxcccountry", qth.dxcc)
  element("cqzone", qth.cqZone)
  element("iaruzone", qth.ituZone)
  element("arrlsection", qth.section)
  element("stprvoth", qth.state)
  if (qth.grid && qth.grid.length >= 6) element("grid6", qth.grid.slice(0, 6))
  else element("grid4", qth.grid?.slice(0, 4))
  lines.push("</qth>")

  lines.push("<breakdown>")
  if (input.breakdown !== false) {
    for (const { band, mode, count } of bandModeCounts(input.qsos)) {
      lines.push(`<qso band="${band}" mode="${mode}">${count}</qso>`)
    }
  }
  const qsoTotal = totals.qsos ?? bandModeCounts(input.qsos).reduce((sum, line) => sum + line.count, 0)
  lines.push(`<qso band="total" mode="ALL">${qsoTotal}</qso>`)
  if (totals.points !== undefined) lines.push(`<point band="total" mode="ALL">${totals.points}</point>`)
  if (totals.mults !== undefined && input.multType) {
    lines.push(`<mult band="total" mode="ALL" type="${escape(input.multType)}">${totals.mults}</mult>`)
  }
  lines.push("</breakdown>")

  element("score", Math.round(totals.score))
  element("timestamp", timestamp(input.now))
  lines.push("</dynamicresults>")
  return lines.join("\n")
}

/// A string's UTF-8 bytes, without `TextEncoder`, which not every runtime the
/// app embeds provides.
function utf8(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  }
  return bytes
}

/// `Basic …` for the board's user name and password.
export function basicAuth(user: string, password: string): string {
  const bytes = utf8(`${user}:${password}`)
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63]
    out += b === undefined ? "=" : alphabet[(n >> 6) & 63]
    out += c === undefined ? "=" : alphabet[n & 63]
  }
  return `Basic ${out}`
}

export interface PostAnswer {
  ok: boolean
  status?: number
  message: string
  /// No answer from the board itself: a server or gateway failing, or busy,
  /// worth trying again soon rather than taking as a refusal.
  transient?: boolean
  /// A refusal of the call and password.
  auth?: boolean
  /// A refusal because the board is not taking scores for the contest:
  /// closed, or not open yet.
  closed?: boolean
}

/// The board answers JSON inside an HTML response, `{"status":200,
/// "status_message":"OK-Full"}`, sometimes with stray markup or typographic
/// quotes around it, so the two fields are read by pattern.
export function readAnswer(httpStatus: number, body: string): PostAnswer {
  const plain = body.replace(/[“”″]/g, '"')
  const status = Number(/"status"\s*:\s*"?(\d+)/.exec(plain)?.[1])
  const message = /"status_message"\s*:\s*"([^"]*)"/.exec(plain)?.[1] ?? ""
  const auth = (code: number, text: string) => code === 401 || code === 403 || /password|unauthori[sz]ed|login|credential/i.test(text)
  const transient = (code: number) => code >= 500 || code === 408 || code === 429
  if (Number.isFinite(status)) {
    const ok = status === 200
    const why = message || String(status)
    if (!ok && transient(status)) return { ok, status, message: why, transient: true }
    if (!ok && /contest is closed/i.test(message)) return { ok, status, message: why, closed: true }
    return { ok, status, message: why, ...(!ok && auth(status, message) ? { auth: true } : {}) }
  }
  if (httpStatus === 401 || httpStatus === 403) return { ok: false, status: httpStatus, message: `HTTP ${httpStatus}`, auth: true }
  if (transient(httpStatus)) return { ok: false, status: httpStatus, message: `HTTP ${httpStatus}`, transient: true }
  const text = plain.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
  return { ok: httpStatus === 200 && /\bOK\b/.test(text), status: httpStatus, message: text || `HTTP ${httpStatus}` }
}
