// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Reading Contest Online ScoreBoard's pages (contestonlinescore.com). It
// publishes no API for reading, so these take apart the HTML it serves:
//
//   * `/scoreboard/?contest_id=N` is one contest's board, a table per category
//     (`SO-ALL HP CW`), each a header row (class `title5`) and then a row per
//     station (`tbl1`/`tbl2`). A header names its columns: Score, QSO, the
//     contest's multipliers (none, one or two), then Last. Its first cell
//     spans the rank and the call, so header cell `i` is row cell `i + 1`. The
//     cells after Last (club, logger) are not read.
//   * Every board page carries the contest picker, a `<select name=contest_id>`
//     whose options read `Closed: …`, `On air: …` or `Coming: …`, and links to
//     outside tools that name the contest by its Cabrillo id
//     (`?contest=CW-Ops`). That id is how a board is matched to an operation.
//   * `/settings/` lists every contest the board takes, with its Cabrillo id
//     and the type of each multiplier it counts (`country`, `zone`, …).
//
// The site writes loose HTML (a header cell or two is never closed), so rows
// and cells are cut at their opening tags rather than matched in pairs.

export const SITE = "https://contestonlinescore.com"

export interface ContestChoice {
  /// The board's `contest_id`.
  id: string
  name: string
  state: "closed" | "onAir" | "coming" | "other"
  selected: boolean
}

export interface BoardRow {
  rank: string
  /// The call as the board shows it, operators included: `NT6Q (N5ZO)`.
  label: string
  /// The station's call alone: `NT6Q`.
  call: string
  score: string
  qsos: string
  /// One per multiplier column, in the header's order.
  mults: string[]
  last: string
  /// The board shows a score it heard recently in green, an older one in grey.
  fresh: boolean
}

export interface BoardCategory {
  /// The category as its header reads: `SO-ALL HP CW`.
  title: string
  multLabels: string[]
  rows: BoardRow[]
}

export interface Board {
  /// The Cabrillo id the page links its tools with, when it does.
  contestId?: string
  /// The contest as the picker names it, without its state.
  contestName?: string
  contests: ContestChoice[]
  categories: BoardCategory[]
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" }

/// A cell's text: tags dropped (`<a>SO</a>-<a>ALL</a>` is `SO-ALL`), entities
/// decoded, white space folded.
export function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
      const lower = name.toLowerCase()
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16))
      if (lower.startsWith("#") && lower !== "#39") return String.fromCodePoint(parseInt(lower.slice(1), 10))
      return ENTITIES[lower] ?? whole
    })
    .replace(/\s+/g, " ")
    .trim()
}

/// The cells of one row's HTML, each as its raw HTML, cut at each `<td`.
function cellsOf(row: string): string[] {
  return row
    .split(/<td\b/i)
    .slice(1)
    .map((cell) => {
      const open = cell.indexOf(">")
      const body = open >= 0 ? cell.slice(open + 1) : cell
      const close = body.search(/<\/td>/i)
      return close >= 0 ? body.slice(0, close) : body
    })
}

/// The picker's contests, in the page's order (closed, on air, coming).
export function parseContests(html: string): ContestChoice[] {
  const select = /<select[^>]*name\s*=\s*['"]?contest_id['"]?[^>]*>([\s\S]*?)<\/select>/i.exec(html)
  if (!select) return []
  const options: ContestChoice[] = []
  const option = /<option\b([^>]*)>([^<]*)/gi
  for (let match = option.exec(select[1]); match; match = option.exec(select[1])) {
    const id = /value\s*=\s*['"]?(\d+)/i.exec(match[1])?.[1]
    if (!id) continue
    const text = textOf(match[2])
    const prefix = /^(Closed|On air|Coming)\s*:\s*/i.exec(text)
    const state = !prefix ? "other" : /^closed/i.test(prefix[1]) ? "closed" : /^on/i.test(prefix[1]) ? "onAir" : "coming"
    options.push({ id, name: prefix ? text.slice(prefix[0].length).trim() : text, state, selected: /\bselected\b/i.test(match[1]) })
  }
  return options
}

/// The Cabrillo id a board page names its contest by, from its tool links.
export function contestIdOf(html: string): string | undefined {
  return /[?&]contest=([A-Za-z0-9][A-Za-z0-9._/-]*)/.exec(html)?.[1]
}

/// `NT6Q (N5ZO)` → `NT6Q`.
export function callOf(label: string): string {
  return label.split(/[\s(]/)[0].toUpperCase()
}

/// One contest's board page.
export function parseBoard(html: string): Board {
  const contests = parseContests(html)
  const start = html.search(/<board>/i)
  const end = html.search(/<\/board>/i)
  const body = start >= 0 ? html.slice(start, end > start ? end : undefined) : html

  const categories: BoardCategory[] = []
  let current: { category: BoardCategory; columns: { index: number; kind: "score" | "qsos" | "mult" | "last" }[] } | undefined
  for (const row of body.split(/<tr\b/i).slice(1)) {
    const attributes = row.slice(0, row.indexOf(">"))
    const cells = cellsOf(row)
    if (/class\s*=\s*['"]?title/i.test(attributes)) {
      const labels = cells.map(textOf)
      const columns: { index: number; kind: "score" | "qsos" | "mult" | "last" }[] = []
      const multLabels: string[] = []
      let phase: "before" | "mults" | "done" = "before"
      labels.forEach((label, index) => {
        if (index === 0 || phase === "done") return
        if (/^score$/i.test(label)) columns.push({ index: index + 1, kind: "score" })
        else if (/^qsos?$/i.test(label)) {
          columns.push({ index: index + 1, kind: "qsos" })
          phase = "mults"
        } else if (/^last$/i.test(label)) {
          columns.push({ index: index + 1, kind: "last" })
          phase = "done"
        } else if (phase === "mults" && label && !/^no multiplier$/i.test(label)) {
          columns.push({ index: index + 1, kind: "mult" })
          multLabels.push(label)
        }
      })
      current = { category: { title: labels[0] ?? "", multLabels, rows: [] }, columns }
      categories.push(current.category)
      continue
    }
    if (!current || !/class\s*=\s*['"]?tbl/i.test(attributes) || cells.length < 4) continue
    const label = textOf(cells[1])
    const at = (kind: "score" | "qsos" | "last") => {
      const column = current!.columns.find((candidate) => candidate.kind === kind)
      return column ? textOf(cells[column.index] ?? "") : ""
    }
    const scoreColumn = current.columns.find((column) => column.kind === "score")
    const scoreCell = scoreColumn ? row.split(/<td\b/i)[scoreColumn.index + 1] ?? "" : ""
    current.category.rows.push({
      rank: textOf(cells[0]),
      label,
      call: callOf(label),
      score: at("score"),
      qsos: at("qsos"),
      mults: current.columns.filter((column) => column.kind === "mult").map((column) => textOf(cells[column.index] ?? "")),
      last: at("last"),
      fresh: /color\s*:\s*green/i.test(scoreCell.slice(0, scoreCell.indexOf(">") + 1)),
    })
  }

  const chosen = contests.find((contest) => contest.selected)
  // The page's footer is a title row too, with no columns and no rows.
  const scored = categories.filter((category) => category.rows.length > 0)
  return { contestId: contestIdOf(html), contestName: chosen?.name, contests, categories: scored }
}

export interface Neighborhood {
  category: BoardCategory
  rows: BoardRow[]
  /// The index in `rows` of the station asked about, or -1 when it is not on
  /// the board, and `rows` are the category's first ones.
  at: number
}

/// The station's category, cut to `above` rows over it and `below` under it;
/// fewer above at the top fill in below, and the other way at the bottom, so
/// the window stays one size. With the station on no board, the first
/// category's top rows.
export function neighborhood(board: Board, call: string, above = 4, below = 4): Neighborhood | undefined {
  const wanted = call.trim().toUpperCase()
  const size = above + below + 1
  for (const category of board.categories) {
    const index = wanted ? category.rows.findIndex((row) => row.call === wanted) : -1
    if (index < 0) continue
    let from = Math.max(0, index - above)
    const to = Math.min(category.rows.length, from + size)
    from = Math.max(0, to - size)
    return { category, rows: category.rows.slice(from, to), at: index - from }
  }
  const first = board.categories[0]
  return first ? { category: first, rows: first.rows.slice(0, size), at: -1 } : undefined
}

/// What `/settings/` says of one contest: its Cabrillo id as the board writes
/// it, and the type of each multiplier it counts.
export interface ContestRules {
  contestId: string
  name: string
  multTypes: string[]
}

/// `/settings/`: a row per contest, `# · name · id · mult 1 · mult 2 · type 1 · type 2`.
export function parseContestRules(html: string): ContestRules[] {
  const rules: ContestRules[] = []
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const cells = cellsOf(row).map(textOf)
    if (cells.length < 7 || !/^\d+$/.test(cells[0]) || !cells[2]) continue
    rules.push({ contestId: cells[2], name: cells[1], multTypes: [cells[5], cells[6]].filter(Boolean) })
  }
  return rules
}

/// Where Ham2K's Cabrillo ids and the board's differ. Everything else matches
/// once case is set aside.
const ALIASES: Record<string, string> = {
  "CWOPS-CWT": "CW-OPS",
  "ARRL-FD": "ARRL-FIELD-DAY",
}

/// The board's own spelling of a Cabrillo id, with the rules it keeps for
/// it; undefined when the board does not take the contest.
export function rulesFor(rules: ContestRules[], cabrilloId: string): ContestRules | undefined {
  const upper = cabrilloId.trim().toUpperCase()
  const wanted = ALIASES[upper] ?? upper
  return rules.find((rule) => rule.contestId.toUpperCase() === wanted)
}

/// Whether two Cabrillo ids name the same contest on the board.
export function sameContest(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const norm = (id: string) => ALIASES[id.trim().toUpperCase()] ?? id.trim().toUpperCase()
  return norm(a) === norm(b)
}

/// The order to open the picker's contests in, looking for one: those on
/// the air first, then those coming, then those closed, the latest first.
/// Given the contest's name, the contests the picker names alike go ahead
/// of the rest, so a long list is not opened board by board.
export function candidateOrder(contests: ContestChoice[], name?: string): ContestChoice[] {
  const ordered = [
    ...contests.filter((contest) => contest.state === "onAir"),
    ...contests.filter((contest) => contest.state === "coming"),
    ...contests.filter((contest) => contest.state === "closed").reverse(),
  ]
  if (!name) return ordered
  const alike = ordered.filter((contest) => namedAlike(contest.name, name))
  return [...alike, ...ordered.filter((contest) => !alike.includes(contest))]
}

/// Whether two contest names are likely the same contest: equal once
/// spaces and punctuation are gone, one inside the other, or sharing their
/// first eight letters (`CWops Mini-CWT 1` and `CWops Mini-CWT 2`).
export function namedAlike(a: string, b: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "")
  const [x, y] = [norm(a), norm(b)]
  if (!x || !y) return false
  if (x.includes(y) || y.includes(x)) return true
  let common = 0
  while (common < x.length && x[common] === y[common]) common++
  return common >= 8
}

/// The `contest_id` in what the operator typed: the number itself, or a board
/// URL carrying it.
export function contestIdFromInput(input: string | undefined): string | undefined {
  const text = (input ?? "").trim()
  if (/^\d+$/.test(text)) return text
  return /[?&]contest_id=(\d+)/.exec(text)?.[1]
}
