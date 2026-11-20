// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// A live scoreboard pane for a contest operation, from Contest Online
// ScoreBoard (contestonlinescore.com): the station's place in its category,
// with as many stations above and below it as the pane has room for, in the
// board's own columns up to Last, drawn as a scene in the theme its settings
// pick.
//
// An integration posts the station's score there every few minutes while
// the operation is open and its log has a contact in the last six hours,
// whether or not a pane is on screen, and whether or not the score moved:
// the board greys a score not updated lately.
// The operator switches it on per operation, on that device, in the
// operation's Integrations dialog, where its settings button holds the
// interval and the breakdown. What keeps it from posting is raised once as a
// notice, for an operator with no pane open. The password the board knows
// the callsign by is kept in the `account` hook.
//
// Which board: the one whose page names the contest by the same Cabrillo id
// the contest's own export writes (`CONTEST: CW-OPS`), found among the
// board's contests; or the one the operator names in the pane's settings, by
// number or link.
//
// A render starts what the network has to do and draws what is held after a
// short wait; work that finishes later, and the integration's calls, draw
// the pane again in place.

import { annotateCallAgainstCountryFile, defineExtension, hooks, host } from "@ham2k/extension-sdk"
import type {
  AccountHook,
  HookContext,
  IntegrationDescribeArgs,
  IntegrationDescriptor,
  IntegrationHook,
  IntegrationObserveArgs,
  JSONValue,
  PanelContent,
  PanelDescriptor,
  PanelHook,
  PanelRenderArgs,
} from "@ham2k/extension-sdk"

import { panelTheme, themeColors, themeField } from "@ham2k/lib-panel-themes"
import type { PanelColors } from "@ham2k/lib-panel-themes"

import { tFor } from "./i18n.ts"
import { HeaderStore } from "./header.ts"
import type { LogHeader } from "./header.ts"
import { DEFAULT_INTERVAL, LIVE_WITHIN_MS, Live, POST_INTERVALS, attemptOf, contestRefOf, lastContactAt, messageOf, totalsOf } from "./live.ts"
import type { ContestRef, PostState } from "./live.ts"
import { FALLBACK_COLORS, FALLBACK_ENVIRONMENT, scoreboardScene } from "./scene.ts"
import type { SceneContent, SceneEnvironment } from "./scene.ts"
import { contestIdFromInput, neighborhood } from "./scoreboard.ts"

import manifest from "../manifest.json" with { type: "json" }

type Qso = Record<string, JSONValue>
type Translate = ReturnType<typeof tFor>

/// How long a render takes at most, from its start, before drawing what it
/// holds: the app gives a render five seconds in all.
const RENDER_BUDGET_MS = 4000

const live = new Live({
  fetch: (url, options) => host.fetch(url, options),
  now: () => Date.now(),
  log: (message) => host.log(message),
})

/// What each operation's export says of it, kept while it holds.
const logHeaders = new HeaderStore(() => Date.now())
/// The key of the extension that exports and scores each operation's
/// contest, from its export: the same whatever the contest's settings.
const scorerKeys = new Map<string, string>()
/// The exports that failed, by operation and contest, and when.
const exportFailures = new Map<string, { at: number; exported: Exported }>()
const EXPORT_RETRY_MS = 5 * 60 * 1000

function str(value: JSONValue | undefined): string {
  return typeof value === "string" ? value.trim() : ""
}

/// `20:05z`, the time of a post.
function hhmm(millis: number): string {
  return `${new Date(millis).toISOString().slice(11, 16)}z`
}

/// The contest's Cabrillo log from its own exporter: the export option the
/// contest offers for this operation in `cabrillo` format, generated.
interface Exported {
  log?: string
  /// The contest extension's key, which is also its scorer's.
  scorerKey?: string
  /// Why there is no log.
  error?: string
}

/// An export, and its header once kept.
interface Learned {
  exported: Exported
  header?: LogHeader
}

/// A failure of the export hooks themselves is reported as the reason,
/// like an exporter's own. An export that failed is not tried again for a
/// few minutes: each pane and the integration would otherwise export the whole
/// log every minute only to fail the same way.
async function cabrilloFor(operation: Qso, qsos: Qso[], refType: string): Promise<Exported> {
  const key = `${str(operation.uuid)}|${refType}`
  const failed = exportFailures.get(key)
  if (failed && Date.now() - failed.at < EXPORT_RETRY_MS) return failed.exported
  let exported: Exported
  try {
    exported = await exportCabrillo(operation, qsos, refType)
  } catch (error) {
    const message = messageOf(error)
    host.log(`Live Scoreboard: the export hooks failed: ${message}`)
    exported = { error: message }
  }
  if (exported.log) exportFailures.delete(key)
  else exportFailures.set(key, { at: Date.now(), exported })
  return exported
}

async function exportCabrillo(operation: Qso, qsos: Qso[], refType: string): Promise<Exported> {
  const offers = await hooks.invokeAll("export", "suggestExportOptions", { operation, qsos })
  const failures: string[] = []
  for (const offer of offers) {
    if (!offer.ok) {
      if (offer.error) failures.push(`${offer.key}: ${offer.error}`)
      continue
    }
    if (!Array.isArray(offer.value)) continue
    const option = (offer.value as Record<string, JSONValue>[]).find((candidate) => candidate.format === "cabrillo" && candidate.refType === refType)
    if (!option) continue
    const exported = await hooks.invokeOne("export", offer.key, "generateExport", { operation, qsos, exportType: option.exportType })
    const done = exported.find((entry) => entry.ok)
    const content = (done?.value as { content?: unknown } | undefined)?.content
    if (typeof content === "string") return { log: content, scorerKey: offer.key }
    const error = exported.find((entry) => !entry.ok)?.error ?? "the export was empty"
    host.log(`Live Scoreboard: the Cabrillo export from ${offer.key} failed: ${error}`)
    return { scorerKey: offer.key, error }
  }
  const error = failures.length ? failures.join("; ") : `no extension offers a Cabrillo log for ${refType}`
  host.log(`Live Scoreboard: no Cabrillo log: ${error}`)
  return { error }
}

/// Where posting stands, in a few words for the pane's top right corner.
function statusLine(state: PostState, t: Translate): string {
  switch (state.kind) {
    case "idle":
      return t("statusIdle")
    case "noContest":
      return t("statusNoContest")
    case "noCall":
      return t("statusNoCall")
    case "noAccount":
      return t("statusNoAccount")
    case "notLive":
      return t("statusNotLive")
    case "noScores":
      return t("statusNoScores")
    case "noTally":
      return t("statusNoTally")
    case "noExport":
      return t("statusNoExport")
    case "notOnBoard":
      return t("statusNotOnBoard", { contest: state.contestId })
    case "posting":
      return t("statusPosting")
    case "posted":
      return t("statusPosted", { time: hhmm(state.at) })
    case "refused":
      return t("statusRefused", { time: hhmm(state.at) })
    case "closed":
      return t("statusClosed")
    case "failed":
      return t("statusFailed")
  }
}

/// What keeps the score from the board, in full, for a notice.
function noticeLine(state: PostState, t: Translate): string {
  switch (state.kind) {
    case "noAccount":
      return t("postNoAccount")
    case "noScores":
      return t("postNoScores")
    case "noExport":
      return t("postNoExport", { message: state.message })
    case "notOnBoard":
      return t("postNotOnBoard", { contest: state.contestId })
    case "refused":
      return t("postRefused", { time: hhmm(state.at), message: state.message })
    case "closed":
      return t("postClosed", { message: state.message })
    default:
      return statusLine(state, t)
  }
}

/// What keeps the score from the board until the operator does something.
const ALERTS = new Set<PostState["kind"]>(["refused", "failed", "noExport", "noAccount", "notOnBoard"])

/// What a render learned from the app, enough to draw the pane again from
/// what the network work leaves held.
interface Placement {
  t: Translate
  call: string
  uuid: string
  contest?: ContestRef
  boardInput: string
  named?: string
  cabrilloId?: string
  exportError?: string
  environment: SceneEnvironment
  colors: PanelColors
  /// Teal's primary is a dark ink close to its black, so the operator's row
  /// takes it as a deeper band there, its text in black, rather than as a
  /// tint and a text color.
  ownRowBand: boolean
}

function compose(p: Placement): SceneContent {
  const t = p.t
  const post = postStatus(p.uuid)
  const status = { text: statusLine(post, t), alert: ALERTS.has(post.kind) }

  if (p.boardInput && !p.named) return { message: t("boardUnreadable", { input: p.boardInput }), status }
  let boardId = p.named
  if (!boardId) {
    if (!p.contest) return { message: t("noContest"), status }
    if (!p.cabrilloId) return { message: t("exportFailed", { message: p.exportError ?? "—" }), status }
    const found = live.foundNow(p.cabrilloId)
    if (found.kind === "searching") return { message: t("boardLoading"), status }
    if (found.kind === "failed") return { message: t("boardFailed", { message: found.message }), status }
    if (found.kind === "missing") return { message: t("boardNotFound", { contest: p.cabrilloId }), status }
    boardId = found.id
  }
  const board = live.boardNow(boardId)
  if (board.kind === "loading") return { message: t("boardLoading"), status }
  if (board.kind === "failed") return { message: t("boardFailed", { message: board.message }), status }
  const title = board.board.contestName ?? t("panelTitle")
  // The whole category: the scene keeps as many rows as the pane has room
  // for, the station's in the middle.
  const view = neighborhood(board.board, p.call, Infinity, Infinity)
  // The corner says what posting has to say, unless it is posting: then that
  // the board could not be read again, and since when; then that the call is
  // not on it, the rows shown being the top of the first category.
  const posting = post.kind === "posted" || post.kind === "posting"
  const corner = !posting
    ? status
    : board.stale
      ? { text: t("statusBoardStale", { time: hhmm(board.stale.since) }), alert: true }
      : view && view.at < 0
        ? { text: t("statusCallMissing", { call: p.call || "—" }), alert: false }
        : status
  if (!view) return { title, message: t("boardEmpty"), status: corner }
  return {
    title,
    category: view.category.title,
    view,
    columns: { call: t("colCall"), score: t("colScore"), qsos: t("colQsos"), last: t("colLast") },
    status: corner,
  }
}

/// The placements drawn lately, to draw again when work finishes.
const placements = new Map<string, { at: number; placement: Placement }>()
const PLACEMENT_KEPT_MS = 10 * 60 * 1000

live.onChange = () => {
  const now = Date.now()
  for (const [instanceId, { at, placement }] of placements) {
    if (now - at > PLACEMENT_KEPT_MS) {
      placements.delete(instanceId)
      continue
    }
    if (typeof host.updateScene !== "function") continue
    const failed = (error: unknown) => host.log(`Live Scoreboard: redrawing the pane failed: ${messageOf(error)}`)
    // Called as the network work finishes: a pane that cannot be drawn is
    // logged here rather than taken for the work failing.
    try {
      const scene = scoreboardScene(compose(placement), placement.environment, placement.colors, placement.ownRowBand)
      // A placement showing another scene by now is drawn again whole by the app.
      host.updateScene(instanceId, [{ set: ["layers"], value: scene.layers as unknown as JSONValue }]).catch(failed)
    } catch (error) {
      failed(error)
    }
  }
}

/// Decides whether the score is due to post and, when it is, gathers it
/// from the app and starts the post. Answers why it cannot post, or nothing
/// when posting stands as the last attempt left it.
async function preparePost(
  args: Pick<IntegrationObserveArgs, "operation" | "config" | "clock">,
  ctx: HookContext,
  inputs: { call: string; uuid: string; contest?: ContestRef; qsos: Qso[]; header?: LogHeader; learn: () => Promise<Learned>; t: Translate },
): Promise<PostState | undefined> {
  const { call, uuid, contest, qsos } = inputs
  if (!contest || !uuid) return { kind: "noContest" }
  if (!call) return { kind: "noCall" }
  const password = ctx.account?.credentials?.password
  if (!password) return { kind: "noAccount" }
  const lastAt = lastContactAt(qsos)
  if (lastAt === undefined || args.clock.nowMillis - lastAt > LIVE_WITHIN_MS) return { kind: "notLive" }
  if (!ctx.getScores) return { kind: "noScores" }
  const attempt = attemptOf(call, contest, password)
  const everyMs = intervalOf(args.config) * 60 * 1000
  if (!live.due(uuid, attempt, everyMs)) return undefined

  try {
    // The score is read first, and the whole log exported only for a header
    // not held.
    let header = inputs.header
    let scorerKey = scorerKeys.get(`${uuid}|${contest.type}`)
    if (!scorerKey) {
      const learned = await inputs.learn()
      if (!learned.exported.scorerKey) return { kind: "noExport", message: learned.exported.error ?? "—" }
      scorerKey = learned.exported.scorerKey
      header = learned.header
    }
    const all = await ctx.getScores(uuid)
    const totals = totalsOf(all, scorerKey)
    if (!totals) {
      host.log(`Live Scoreboard: no operation total under ${scorerKey}; the scorers that answered: ${Object.keys(all ?? {}).join(", ") || "none"}`)
      return { kind: "noTally" }
    }
    const breakdown = args.config?.breakdown !== false
    if (!header) {
      const learned = await inputs.learn()
      if (!learned.header) return { kind: "noExport", message: learned.exported.error ?? "—" }
      header = learned.header
    }
    const headers = header.headers
    if (!headers.CONTEST) return { kind: "noExport", message: inputs.t("noContestLine") }
    const info = annotateCallAgainstCountryFile(call)
    live.startPost(
      {
        operationUuid: uuid,
        call,
        password,
        headers,
        totals,
        qsos,
        breakdown,
        everyMs,
        qth: { dxcc: info.entityPrefix, cqZone: info.cqZone, ituZone: info.ituZone, grid: str(args.operation.grid) },
        soft: ctx.appName ?? "Ham2K Logger",
        version: manifest.version,
      },
      attempt,
    )
    return undefined
  } catch (error) {
    const message = messageOf(error)
    host.log(`Live Scoreboard: could not gather the score: ${message}`)
    return { kind: "failed", at: Date.now(), message }
  }
}

/// The log's contacts, or why the app would not share them. Its event
/// markers (breaks, starts, notes) are not contacts: they neither keep a log
/// on the air nor go into its Cabrillo file.
async function readLog(uuid: string, ctx: HookContext, t: Translate): Promise<{ qsos?: Qso[]; problem?: string }> {
  try {
    const qsos = ctx.getQsos ? await ctx.getQsos(uuid) : null
    return qsos ? { qsos: qsos.filter((qso) => qso.band !== "event") } : { problem: t("noLogShared") }
  } catch (error) {
    const problem = messageOf(error)
    host.log(`Live Scoreboard: could not read the log: ${problem}`)
    return { problem }
  }
}

/// Keeps what an export says of the operation's contest: its header, and the
/// key of the extension that exports and scores it.
function learnFromExport(uuid: string, operation: Qso, contest: ContestRef, qsos: Qso[], exported: Exported): Learned {
  if (exported.scorerKey) scorerKeys.set(`${uuid}|${contest.type}`, exported.scorerKey)
  return { exported, header: exported.log ? logHeaders.set(uuid, operation, contest, qsos, exported.log) : undefined }
}

/// What the integration last found of each operation's posting, and when:
/// one switched off for an operation stops calling about it, and a pane says
/// so once it has been quiet a while. Where it is on, the host calls about the
/// operation as the runtime starts, so a pane takes it as on its way only for
/// as long as that first call takes; any longer, and a pane in an operation it
/// was never switched on in says it posts where nothing does.
const observed = new Map<string, { at: number; block?: PostState }>()
const POSTER_QUIET_MS = 3 * 60 * 1000
const POSTER_STARTING_MS = 20 * 1000
const startedAt = Date.now()

function postStatus(uuid: string): PostState {
  const seen = observed.get(uuid)
  if (!seen) return Date.now() - startedAt < POSTER_STARTING_MS ? { kind: "posting" } : { kind: "idle" }
  if (Date.now() - seen.at > POSTER_QUIET_MS) return { kind: "idle" }
  return seen.block ?? live.postState(uuid) ?? { kind: "posting" }
}

/// The posting interval in minutes: one the integration offers, or the default.
let unknownInterval: string | undefined
function intervalOf(config: Record<string, JSONValue> | undefined): number {
  const minutes = Number(config?.interval)
  if ((POST_INTERVALS as readonly number[]).includes(minutes)) return minutes
  const given = config?.interval
  if (given !== undefined && given !== null && String(given) !== unknownInterval) {
    unknownInterval = String(given)
    host.log(`Live Scoreboard: posting interval "${unknownInterval}" is not one offered; posting every ${DEFAULT_INTERVAL} minutes`)
  }
  return DEFAULT_INTERVAL
}

/// The posting states a notice raises for a log with recent contacts, since
/// an operator with no pane open sees nothing else of them; and what each
/// operation was last told, so a state is raised once as it starts rather
/// than at every call. A refusal is told again for each post refused; a
/// contest the board is not taking, once.
const NOTICES = new Set<PostState["kind"]>(["noAccount", "noScores", "noExport", "notOnBoard", "refused", "closed"])
/// What ends a notice: the score posted, or nothing trying to post any more.
const SETTLED = new Set<PostState["kind"]>(["posted", "idle", "noContest", "notLive"])
const noticed = new Map<string, string>()

async function tellOperator(uuid: string, state: PostState | undefined, onAir: boolean, t: Translate): Promise<void> {
  const said = noticed.get(uuid)
  const key = `posting-${uuid}`
  try {
    if (state && onAir && NOTICES.has(state.kind)) {
      const mark = `${state.kind}|${"message" in state ? state.message : ""}|${"at" in state ? state.at : ""}`
      if (said === mark) return
      noticed.set(uuid, mark)
      const password = state.kind === "noAccount" || (state.kind === "refused" && state.auth)
      await host.statusBar.showNotice({
        key,
        title: t("postLabel"),
        text: noticeLine(state, t),
        ...(password ? { actions: [{ label: t("passwordAction"), type: "account" as const, key: manifest.key }] } : {}),
      })
    } else if (said !== undefined && (!onAir || !state || SETTLED.has(state.kind))) {
      // Posted, or nothing trying to post any more. A post on its way, or one
      // that failed, leaves the notice as it is until it is answered.
      noticed.delete(uuid)
      await host.statusBar.dismissNotice(key)
    }
  } catch (error) {
    host.log(`Live Scoreboard: could not raise the posting notice: ${messageOf(error)}`)
  }
}

/// Waits for the work running, up to [ms], however much of it there is.
async function settle(ms: number): Promise<void> {
  const until = Date.now() + ms
  for (;;) {
    const pending = live.pending()
    const left = until - Date.now()
    if (!pending.length || left <= 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([Promise.allSettled(pending), new Promise((done) => (timer = setTimeout(done, left)))])
    clearTimeout(timer)
    // Work just done may have started more: the board found, then read.
  }
}

export const ScoreboardPanel: PanelHook = {
  async getPanels(_args: Record<string, never>, ctx: HookContext): Promise<PanelDescriptor[]> {
    const t = tFor(ctx)
    return [
      {
        key: "scoreboard",
        title: t("panelTitle"),
        description: t("panelDescription"),
        icon: manifest.icon,
        on: ["tick:60", "operation"],
        form: [
          { type: "field", fieldType: "text", key: "board", label: t("boardLabel"), description: t("boardDescription") },
          themeField(ctx.locale),
        ],
      },
    ]
  },

  async render(args: PanelRenderArgs, ctx: HookContext): Promise<PanelContent> {
    const deadline = Date.now() + RENDER_BUDGET_MS
    const t = tFor(ctx)
    const operation = args.operation
    const call = str(operation.stationCall).toUpperCase()
    const uuid = str(operation.uuid)
    const contest = contestRefOf(operation)
    const boardInput = str(args.config?.board)
    const named = contestIdFromInput(boardInput)
    const theme = panelTheme(args.config)

    // The contest's id, from the header of its export: the one held, or a
    // new export once the contest's settings have changed.
    let header = contest && uuid && !named ? logHeaders.get(uuid, operation, contest) : undefined
    let exportError: string | undefined
    if (contest && uuid && !header && !named) {
      const log = await readLog(uuid, ctx, t)
      if (log.qsos) {
        const learned = learnFromExport(uuid, operation, contest, log.qsos, await cabrilloFor(operation, log.qsos, contest.type))
        header = learned.header
        exportError = learned.exported.error
      } else exportError = log.problem
    }
    const cabrilloId = header?.cabrilloId
    if (header && !cabrilloId) exportError = t("noContestLine")

    const placement: Placement = {
      t,
      call,
      uuid,
      contest,
      boardInput,
      named,
      cabrilloId,
      exportError,
      environment: (args.environment as SceneEnvironment | undefined) ?? FALLBACK_ENVIRONMENT,
      colors: themeColors(theme, args.environment?.colors ?? FALLBACK_COLORS),
      ownRowBand: theme === "teal",
    }
    if (args.instanceId) placements.set(args.instanceId, { at: Date.now(), placement })

    // Composing starts the board's work; the scene is drawn once it is
    // done, or from what is held when the wait runs out.
    compose(placement)
    await settle(deadline - Date.now())
    return { kind: "scene", scene: scoreboardScene(compose(placement), placement.environment, placement.colors, placement.ownRowBand) }
  },
}

/// The contest's name as the operation shows it: the label its ref was
/// saved with. A ref saved without one names its type, which is all an
/// extension can learn of another's contest without its ref handler.
function contestNameOf(contest: ContestRef): string {
  return str(contest.ref.label) || str(contest.ref.shortLabel) || contest.type
}

/// Posts the score of each open contest operation it is switched on for,
/// pane or no pane.
export const Poster: IntegrationHook = {
  async getIntegrations(_args: Record<string, never>, ctx: HookContext): Promise<IntegrationDescriptor[]> {
    const t = tFor(ctx)
    return [
      {
        key: "poster",
        title: t("postLabel"),
        description: t("postDescription"),
        icon: manifest.icon,
        on: ["qsoLogged", "tick:60", "operation"],
        form: [
          {
            type: "field",
            fieldType: "select",
            key: "interval",
            label: t("intervalLabel"),
            value: String(DEFAULT_INTERVAL),
            options: POST_INTERVALS.map((minutes) => ({ value: String(minutes), label: t("intervalMinutes", { count: minutes }) })),
          },
          { type: "field", fieldType: "checkbox", key: "breakdown", label: t("breakdownLabel"), description: t("breakdownDescription"), value: true },
        ],
      },
    ]
  },

  /// What it would post in this operation, and how often; or what keeps it
  /// from posting, checked in the order `preparePost` checks it.
  async describe({ operation, config }: IntegrationDescribeArgs, ctx: HookContext): Promise<string | null> {
    const t = tFor(ctx)
    const contest = contestRefOf(operation)
    if (!contest) return t("describeNoContest")
    if (!str(operation.stationCall)) return t("postNoCall")
    if (!ctx.account?.credentials?.password) return t("postNoAccount")
    return t("describe", { contest: contestNameOf(contest), minutes: intervalOf(config) })
  },

  async observe(args: IntegrationObserveArgs, ctx: HookContext): Promise<void> {
    const t = tFor(ctx)
    const operation = args.operation
    const uuid = str(operation.uuid)
    if (!uuid) return
    const call = str(operation.stationCall).toUpperCase()
    const contest = contestRefOf(operation)
    let block: PostState | undefined
    // Whether the log has a contact recent enough to post: only then is what
    // keeps it from posting worth a notice. A log the app would not share
    // counts as on the air, since nothing can be posted from it.
    let onAir = false
    if (!contest) block = { kind: "noContest" }
    else {
      const log = await readLog(uuid, ctx, t)
      if (!log.qsos) {
        block = { kind: "noExport", message: log.problem ?? "—" }
        onAir = true
      } else {
        const qsos = log.qsos
        const lastAt = lastContactAt(qsos)
        onAir = lastAt !== undefined && args.clock.nowMillis - lastAt <= LIVE_WITHIN_MS
        let learned: Promise<Learned> | undefined
        const learn = () => (learned ??= cabrilloFor(operation, qsos, contest.type).then((exported) => learnFromExport(uuid, operation, contest, qsos, exported)))
        const header = logHeaders.get(uuid, operation, contest, qsos)
        block = await preparePost(args, ctx, { call, uuid, contest, qsos, header, learn, t })
      }
    }
    const before = observed.get(uuid)
    observed.set(uuid, { at: Date.now(), block })
    // The panes draw again when what they would say has changed, or when
    // they had taken posting for switched off.
    if (!before || Date.now() - before.at > POSTER_QUIET_MS || JSON.stringify(before.block) !== JSON.stringify(block)) live.onChange()
    await tellOperator(uuid, block ?? live.postState(uuid), onAir, t)
  },
}

const Account: AccountHook = {
  label: "Contest Online ScoreBoard",
  description: (_args, ctx) => tFor(ctx)("accountDescription"),
  fields: (_args, ctx) => {
    const t = tFor(ctx)
    return [{ key: "password", label: t("passwordLabel"), type: "secret", postface: t("passwordPostface") }]
  },
  async testCredentials(credentials: Record<string, string>, ctx: HookContext): Promise<string> {
    const t = tFor(ctx)
    if (!credentials.password?.trim()) throw new Error(t("passwordMissing"))
    // The board has no call that checks a password without posting a score,
    // so the first post is the test; the pane says how it went.
    return t("passwordSaved")
  },
}

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook("account", { hook: Account, key: manifest.key })
    registerHook("integration", { hook: Poster, key: manifest.key })
    registerHook("panel", { hook: ScoreboardPanel, key: manifest.key })
  },
})
