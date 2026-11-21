// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// DX cluster spots: every `DX de` line the node sends, as a spot on the
// operator's board, and the operator's own spots posted the other way. The app
// holds the one connection to the node picked in Settings (its
// docs/design/cluster.md), logged in as the operator.
//
// The node sends spots as they happen, and they go on the board as they come:
// the newest spot of each station on each band in each mode, kept here for as
// long as a spot is worth showing, and taken off once the station has spotted
// itself QRT there. The board also asks for all of them every two minutes,
// which is what takes the ones too old to show off it. Only the lines that
// can be spots reach this extension at all; the app keeps the rest.
//
// Reading needs the session held open, which a subscription does. The session
// is the operator's own login, which their other cluster client (N1MM, a band
// map) may be fighting for, so it is held only while the board is asking:
// once nothing has fetched for a while, the subscription is let go and the
// app closes the session when idle.
//
// The board is where the operator narrows spots down, by band, mode, age and
// continent, so the node is asked for all of them: the first session as each
// call on each node clears the filters the operator set there, and turns the
// skimmers on. Those settings belong to the call on that node, so the
// operator's other clients see everything from then on too.
//
// A node pushes only what is spotted from the login on, so each new session
// then asks it for the spots before that (`SH/DX/100`). Its reply comes
// through the same lines as the rest, in the node's listing format.
//
// Posting — a self-spot, or a spot of a station just worked — goes out once,
// to that one node, which forwards it to the rest of the network.

import { defineExtension, host } from "@ham2k/extension-sdk"
import type { ClusterHook, ClusterLine, ClusterReply, ClusterStatus, DynamicSettingsPanel, FormDefinition, HookContext, JSONValue, PostOtherSpotRequest, PostResult, PostSelfSpotRequest, SettingsPanelDescriptor, Spot, SpotEligibility, SpotsHook } from "@ham2k/extension-sdk"

import manifest from "../manifest.json" with { type: "json" }
import { tFor } from "./i18n.ts"
import { SPOT_LINE_PATTERNS, isPromptFor, isRbn, isSignOff, nodeProgramFromPrompt, parseSpotLine } from "./parse.ts"
import type { NodeProgram } from "./parse.ts"
import { firstCall, isTestCall, selfSpotCall, spotComment, type Json } from "./spotText.ts"

/// How long a spot stays on the board after the node announced it. A cluster
/// spot is news rather than a schedule: a station spotted an hour ago has
/// usually moved on, and the next spot of it replaces this one anyway.
const MAX_AGE_MILLIS = 60 * 60 * 1000

/// The most spots handed over at once, the newest. A contest weekend with the
/// skimmers on announces thousands an hour, and every one crosses the hook
/// bridge on every refresh.
const MAX_SPOTS = 2000

/// How long after the last fetch the subscription is let go: five of the
/// board's two-minute refreshes, so a board that is merely slow keeps it.
const RELEASE_AFTER_MILLIS = 10 * 60 * 1000

/// What a new session asks the node for: its newest hundred spots. Every node
/// in Settings takes this form; CC Cluster reads `SH/DX 100` as "on 100 kHz".
const BACKFILL_COMMAND = "SH/DX/100"

/// What each node program takes to send everything: no filter, and the
/// skimmers' CW, RTTY, PSK and beacon spots. Not their FT8 and FT4, which
/// would bury the rest under thousands of decodes an hour. CC Cluster's reset
/// puts back its sysop's default band filter (no CW on 2 m and up, among
/// others), so that is turned off after it.
const SEND_EVERYTHING: Record<NodeProgram, string[]> = {
  "AR-Cluster": ["SET DX FILTER"],
  DXSpider: ["CLEAR/SPOTS ALL", "SET/SKIMMER CW RTTY PSK BEACON"],
  "CC Cluster": ["SET/NOFILTER", "SET/FILTER DXBM/OFF", "SET/SKIMMER"],
}

/// How far back to look for the node's prompt, which a session's lines start
/// with: its login ends on one.
const PROMPT_LOOKBACK = 200

/// The newest spot per station per band and mode, keyed `CALL|band|mode`,
/// one map for the spots people made and one for the RBN's skimmers. A
/// station that moves within a band is where it was last spotted; one on two
/// bands at once (a multi-op, a skimmer hearing both), or in two modes on one
/// (CW at the bottom, SSB up top), is on both. A station's own QRT is held
/// like any spot, so an older one arriving after it (a backfill lists newest
/// first) cannot take its place, but the board is never shown it.
///
/// The skimmers' are held apart so that ignoring them shows the newest spot a
/// person made: in one map, a skimmer re-spotting a station every few minutes
/// replaces it, and ignoring the skimmer would leave the station off the
/// board. Both are held whatever the setting, so it changes only what shows.
const people = new Map<string, Spot>()
const skimmers = new Map<string, Spot>()

/// The newest line read back on a fetch, by the `seq` the app numbers them
/// with. Only a fetch moves it: a pushed batch can arrive ahead of an older
/// one still being read back, or after one whose delivery failed, and moving
/// it there would skip those for good. A line taken both ways is harmless —
/// it is the same spot, and replaces itself.
let cursor = 0

let subscribed = false
let releaseTimer: number | undefined

/// The session already asked, as `CALL@host:port`. A session logged in as
/// another operator, or to another node, is asked again.
let startedFor: string | undefined

/// The sessions whose filters this runtime has cleared, as `CALL@host:port`:
/// the node keeps them cleared from then on, so a reconnect needs only the
/// backfill. A new runtime clears them once more, in case the operator set
/// one since.
const cleared = new Set<string>()

/// The program behind each node, as `host:port`, once a prompt has named it.
const programs = new Map<string, NodeProgram>()

/// Whether the operator chose to leave the Reverse Beacon Network's spots off
/// the board. Read at activation, and changed by the settings panel. The node
/// still sends them: its skimmer setting belongs to the call on that node, so
/// turning it off here would turn it off for the operator's other clients too.
let ignoreRbn = false

/// What the board shows under [key]: the newer of the two spots held there,
/// the person's on a tie (both are dated to the minute, so a skimmer hearing
/// the same CQ is often no newer), leaving out the skimmers' while they are
/// ignored, and nothing once the station has signed off.
function shown(key: string): Spot | undefined {
  const person = people.get(key), skimmer = ignoreRbn ? undefined : skimmers.get(key)
  const newest = !skimmer || (person && person.spot.timeInMillis >= skimmer.spot.timeInMillis) ? person : skimmer
  return newest && !isSignOff(newest) ? newest : undefined
}

/// Holds what [lines] say, and answers what changed on the board for it: the
/// spots it now shows that it did not, and the keys it no longer shows
/// anything under. Each spot carries its key, so a newer one replaces it on
/// the board too. A spot already past [MAX_AGE_MILLIS] — the older end of a
/// backfill — is neither held nor pushed.
function take(lines: ClusterLine[]): { put: Spot[]; removed: string[] } {
  const before = new Map<string, Spot | undefined>()
  const oldest = Date.now() - MAX_AGE_MILLIS
  for (const line of lines) {
    const parsed = parseSpotLine(line.text, line.at)
    if (!parsed || parsed.spot.timeInMillis < oldest) continue
    const key = `${parsed.their.call}|${parsed.band ?? ""}|${parsed.mode ?? ""}`
    const spot: Spot = { ...parsed, key }
    const held = isRbn(spot) ? skimmers : people
    const previous = held.get(key)
    if (previous && spot.spot.timeInMillis < previous.spot.timeInMillis) continue
    if (!before.has(key)) before.set(key, shown(key))
    held.set(key, spot)
  }
  const put: Spot[] = [], removed: string[] = []
  for (const [key, was] of before) {
    const now = shown(key)
    if (now === was) continue
    if (now) put.push(now)
    else removed.push(key)
  }
  return { put, removed }
}

function current(now: number): Spot[] {
  for (const held of [people, skimmers]) {
    for (const [key, spot] of held) {
      if (now - spot.spot.timeInMillis > MAX_AGE_MILLIS) held.delete(key)
    }
  }
  return [...new Set([...people.keys(), ...skimmers.keys()])]
    .map(shown)
    .filter((spot) => spot !== undefined)
    .sort((a, b) => b.spot.timeInMillis - a.spot.timeInMillis)
    .slice(0, MAX_SPOTS)
}

/// Subscribes if need be, and puts off letting go.
function holdSession() {
  if (!subscribed) {
    subscribed = true
    // Not awaited: connecting and logging in take up to ten seconds, which
    // is the whole of a spots hook's budget. The spots arrive on the next
    // refresh instead.
    host.clusterSubscribe({ match: SPOT_LINE_PATTERNS }).then(startSession, () => {
      subscribed = false
    })
  }
  if (releaseTimer !== undefined) host.clearTimeout(releaseTimer)
  releaseTimer = host.setTimeout(releaseSession, RELEASE_AFTER_MILLIS)
}

/// Starts a session not started yet: everything the node has, and the spots
/// from before the login. Not awaited either: the reply's lines reach `take`
/// the way every line does, and a command that failed is retried at the next
/// fetch.
function startSession(status: ClusterStatus) {
  if (status.state !== "connected" || !status.call) {
    startedFor = undefined
    return
  }
  const node = `${status.node.host}:${status.node.port}`
  const session = `${status.call}@${node}`
  if (!subscribed || session === startedFor) return
  startedFor = session
  sendEverything(session, status.call, node)
    .then(() => send(BACKFILL_COMMAND))
    .catch(() => {
      if (startedFor === session) startedFor = undefined
    })
}

async function sendEverything(session: string, call: string, node: string) {
  if (cleared.has(session)) return
  let program = programs.get(node)
  if (!program) {
    // The newest prompt only: one further back can be another node's, from
    // before the operator picked this one.
    const lines = await host.clusterLines({ limit: PROMPT_LOOKBACK })
    let i = lines.length - 1
    while (i >= 0 && !isPromptFor(lines[i].text, call)) i--
    program = i >= 0 ? nodeProgramFromPrompt(lines[i].text) : undefined
  }
  // A node whose program is not one of these is only read, filters and all:
  // a command one program takes may mean something else to another.
  if (!program) return
  programs.set(node, program)
  for (const command of SEND_EVERYTHING[program]) await send(command)
  cleared.add(session)
}

async function send(command: string) {
  const reply = await host.clusterSend(command)
  if (!reply.ok) throw new Error(reply.error ?? "failed")
}

/// The host's error codes that have words of their own; anything else falls
/// back to what the node said, then to the code itself.
const known = new Set(["unsupported", "noCall", "connectFailed", "needsPassword", "loginFailed", "disconnected", "timeout", "tooSoon", "invalidCall", "invalidFrequency"])

function resultOf(reply: ClusterReply, ctx: HookContext): PostResult {
  if (reply.ok) return { ok: true }
  const t = tFor(ctx), error = reply.error ?? ""
  const message = error === "refused" && reply.message ? t("refused", { message: reply.message }) : known.has(error) ? t(error) : (reply.message ?? (error || t("notPosted")))
  return { ok: false, message }
}

async function clusterAvailable(): Promise<boolean> {
  const status = await host.clusterStatus()
  return status.error !== "unsupported"
}

function releaseSession() {
  releaseTimer = undefined
  if (!subscribed) return
  subscribed = false
  startedFor = undefined
  host.clusterUnsubscribe().catch(() => {})
}

const Spots: SpotsHook = {
  // Not "DX Cluster", which the retired `ki2d-cluster-spotter` answers as
  // wherever it is still installed: the Spots panel lists every source by
  // this name, and two alike would leave the operator guessing which is which.
  sourceName: "Cluster Spots",

  async fetchSpots(): Promise<Spot[]> {
    const status = await host.clusterStatus()
    // On web, or in an app without the cluster, there is nothing to read.
    if (status.error === "unsupported") return []

    // The app numbers lines from 1 again only when its cluster service is
    // rebuilt; a cursor past its newest line would skip everything after.
    if (status.lastSeq < cursor) cursor = 0

    holdSession()
    // A session that dropped and came back, or one already up when this
    // subscribed, between two fetches.
    startSession(status)
    // What the node sent since the last read — the scrollback on the first —
    // and anything a delivery to the hook below missed: a failed one is not
    // retried, but its lines stay readable here.
    const lines = await host.clusterLines({ after: cursor, match: SPOT_LINE_PATTERNS })
    take(lines)
    if (lines.length) cursor = lines[lines.length - 1].seq
    return current(Date.now())
  },

  async isSelfSpotEnabled({ operation }): Promise<SpotEligibility> {
    if (!firstCall(operation.stationCall)) return { enabled: false }
    return (await clusterAvailable()) ? { enabled: true, icon: manifest.icon } : { enabled: false }
  },

  async isOtherSpotEnabled({ qso }): Promise<SpotEligibility> {
    const their = (qso.their ?? {}) as Json
    if (!their.call || !qso.freq) return { enabled: false }
    return (await clusterAvailable()) ? { enabled: true, icon: manifest.icon } : { enabled: false }
  },

  async postSelfSpot({ operation, freq, comment }: PostSelfSpotRequest, ctx): Promise<PostResult> {
    const call = selfSpotCall(operation)
    return resultOf(await host.clusterPostSpot({ freq, call, comment: spotComment(operation, comment, isTestCall(call)) }), ctx)
  },

  async postOtherSpot({ qso, comment }: PostOtherSpotRequest, ctx): Promise<PostResult> {
    const their = (qso.their ?? {}) as Json
    return resultOf(await host.clusterPostSpot({ freq: Number(qso.freq), call: firstCall(their.call), comment: spotComment(qso, comment) }), ctx)
  },
}

const Cluster = {
  /// Onto the board as they come, rather than at its next fetch: the spots
  /// a new session asks the node for most of all, which would otherwise wait
  /// up to two minutes on a board that shows nothing yet.
  ///
  /// A push the app refuses is only logged: the spots are held here, and the
  /// next fetch answers with all of them, which puts the board right.
  async onLines({ lines }: { lines: ClusterLine[] }) {
    const { put, removed } = take(lines)
    try {
      if (put.length) await host.spots.put(put)
      if (removed.length) await host.spots.remove(removed)
    } catch (e) {
      host.log(`spots not pushed, left for the next fetch: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
} satisfies ClusterHook

async function loadIgnoreRbn(): Promise<boolean> {
  const extensions = (await host.getSettings()).extensions as Record<string, JSONValue> | undefined
  const mine = extensions?.[`extension_${manifest.key}`] as Record<string, JSONValue> | undefined
  return mine?.ignoreRbn === true
}

const Settings: DynamicSettingsPanel = {
  kind: "dynamic",

  async getPanels(_args: Record<string, never>, ctx: HookContext): Promise<SettingsPanelDescriptor[]> {
    return [{ key: manifest.key, title: tFor(ctx)("settingsTitle"), icon: manifest.icon, sidebar: false, section: "spotting" }]
  },

  async getDefinition(_args: { panelKey: string }, ctx: HookContext): Promise<FormDefinition> {
    return { elements: [{ type: "field", fieldType: "checkbox", key: "ignoreRbn", label: tFor(ctx)("ignoreRbn"), value: ignoreRbn }] }
  },

  /// The board follows at once rather than at its next fetch, up to two
  /// minutes on.
  async onChangeField({ fieldKey, value }: { fieldKey: string; value: unknown }) {
    if (fieldKey !== "ignoreRbn") return
    // Saved first: a save that fails leaves the box, and the board, as stored.
    await host.setSettings({ ignoreRbn: value === true })
    ignoreRbn = value === true
    // A refused push is only logged, as in `onLines`: the setting stands, and
    // the next fetch answers with `current()`, which puts the board right.
    try {
      await host.spots.replace(current(Date.now()))
    } catch (e) {
      host.log(`spots not replaced, left for the next fetch: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
}

defineExtension({
  ...manifest,
  async onActivation({ registerHook }) {
    registerHook("settingsPanel", { hook: Settings, key: manifest.key })
    registerHook("spots", { hook: Spots, key: manifest.key })
    // Under the extension's own key: that is the key the app delivers a
    // subscription's lines to.
    registerHook("cluster", { hook: Cluster, key: manifest.key })
    ignoreRbn = await loadIgnoreRbn()
  },
})
