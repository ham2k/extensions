// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict"
import { test } from "node:test"

import { AUTH_REFUSED_WAIT_MS, CLOSED_WAIT_MS, Live, POST_EVERY_MS, attemptOf, contestRefOf, lastContactAt, totalsOf } from "./live.ts"
import type { FetchAnswer, PostRequest } from "./live.ts"

const rule = (n: number, name: string, id: string) =>
  `<tr align = 'center' class='tbl1' height='18px'><td>${n}</td><td>${name}</td><td>${id}</td><td>Countries</td><td>Zones</td><td>country</td><td>zone</td></tr>`
const RULES = `<table>${rule(106, "CQ WW CW", "CQ-WW-CW")}${rule(107, "NAQP CW", "NAQP-CW")}${rule(108, "ARRL DX CW", "ARRL-DX-CW")}</table>`
const OK = '{"status":200,"status_message":"OK-Full"}'

function harness(answer: (url: string) => FetchAnswer = () => ({ status: 200, body: OK }), rules: () => FetchAnswer = () => ({ status: 200, body: RULES })) {
  let now = Date.UTC(2026, 10, 28, 12, 0, 0)
  const calls: { url: string; method?: string; headers?: Record<string, string>; body?: string }[] = []
  const live = new Live({
    fetch: async (url, options) => {
      calls.push({ url, ...options })
      if (url.endsWith("/settings/")) return rules()
      return answer(url)
    },
    now: () => now,
    log: () => {},
  })
  let changes = 0
  live.onChange = () => changes++
  const request = (over: Partial<PostRequest> = {}): PostRequest => ({
    operationUuid: "op-1",
    call: "KI2D",
    password: "secret",
    headers: { CONTEST: "CQ-WW-CW", "CATEGORY-POWER": "LOW" },
    totals: { score: 100, qsos: 10, points: 20, mults: 5 },
    qsos: [],
    breakdown: true,
    everyMs: POST_EVERY_MS,
    qth: {},
    soft: "Ham2K Logger",
    version: "0.1.0",
    ...over,
  })
  /// Posts when due, as the integration does, and waits for it.
  const attempt = async (over: Partial<PostRequest> = {}, fingerprint = "KI2D|cqww|secret") => {
    const ready = request(over)
    if (live.due(ready.operationUuid, fingerprint, ready.everyMs)) live.startPost(ready, fingerprint)
    await Promise.allSettled(live.pending(true))
    return live.postState(ready.operationUuid)
  }
  const posts = () => calls.filter((call) => call.method === "POST")
  return { live, attempt, posts, calls, advance: (ms: number) => (now += ms), changes: () => changes }
}

test("a score posts at once, then every five minutes, moved or not, so the board never greys it", async () => {
  const { attempt, posts, advance, changes } = harness()
  assert.equal((await attempt())?.kind, "posted")
  assert.equal(posts().length, 1)
  assert.ok(changes() > 0, "the panes are told to draw again")
  assert.equal(posts()[0].url, "https://contestonlinescore.com/post/")
  assert.equal(posts()[0].headers?.Authorization, `Basic ${Buffer.from("KI2D:secret").toString("base64")}`)
  assert.match(posts()[0].body ?? "", /<contest>CQ-WW-CW<\/contest>[\s\S]*<mult band="total" mode="ALL" type="country">5<\/mult>/)

  advance(60 * 1000)
  await attempt({ totals: { score: 150, qsos: 11 } })
  assert.equal(posts().length, 1, "a minute later is too soon, even with a new score")

  advance(POST_EVERY_MS - 60 * 1000)
  await attempt({ totals: { score: 150, qsos: 11 } })
  assert.equal(posts().length, 2, "five minutes later")

  advance(POST_EVERY_MS)
  await attempt({ totals: { score: 150, qsos: 11 } })
  assert.equal(posts().length, 3, "the same score is posted again")
})

test("a pane set to post every two minutes posts that often", async () => {
  const { attempt, posts, advance } = harness()
  const every = { everyMs: 2 * 60 * 1000 }
  await attempt(every)
  advance(2 * 60 * 1000)
  await attempt(every)
  assert.equal(posts().length, 2)
})

test("without the breakdown, only the totals are posted", async () => {
  const { attempt, posts } = harness()
  await attempt({ breakdown: false, qsos: [{ band: "20m", mode: "CW" }] })
  assert.doesNotMatch(posts()[0].body ?? "", /<qso band="20"/)
  assert.match(posts()[0].body ?? "", /<qso band="total" mode="ALL">10<\/qso>/)
})

test("a refused password waits half an hour, unless the password changes", async () => {
  const { attempt, posts, advance } = harness(() => ({ status: 401, body: "Unauthorized" }))
  assert.deepEqual(await attempt(), { kind: "refused", at: Date.UTC(2026, 10, 28, 12, 0, 0), message: "HTTP 401", auth: true })
  advance(POST_EVERY_MS)
  await attempt()
  assert.equal(posts().length, 1, "the same password is not tried again soon")
  await attempt({}, "KI2D|cqww|corrected")
  assert.equal(posts().length, 2, "a corrected one is tried at once")
  advance(AUTH_REFUSED_WAIT_MS)
  await attempt({}, "KI2D|cqww|corrected")
  assert.equal(posts().length, 3)
})

test("any other refusal is tried again at the next five minutes", async () => {
  const { attempt, posts, advance } = harness(() => ({ status: 200, body: '{"status":400,"status_message":"Error! Missing breakdown"}' }))
  assert.equal((await attempt())?.kind, "refused")
  advance(POST_EVERY_MS)
  await attempt()
  assert.equal(posts().length, 2)
})

test("a contest the board is not taking, closed or not open yet, is asked again only every half hour", async () => {
  // Posting runs while the operation is open: without the longer wait, an
  // operation left open after the contest posts, and is refused, at every
  // interval for six hours after its last contact.
  const { attempt, posts, advance } = harness(() => ({ status: 200, body: '{"status":404,"status_message":"Error! Contest is closed or is not valid"}' }))
  assert.deepEqual(await attempt(), { kind: "closed", message: "Error! Contest is closed or is not valid" })
  advance(POST_EVERY_MS)
  await attempt()
  assert.equal(posts().length, 1, "not at the next interval")
  await attempt({}, "KI2D|naqp|secret")
  assert.equal(posts().length, 2, "another contest is asked at once")
  advance(CLOSED_WAIT_MS)
  await attempt({}, "KI2D|naqp|secret")
  assert.equal(posts().length, 3)
})

test("a network failure or a server failing is tried again a minute on, not at every call", async () => {
  let reply: () => FetchAnswer = () => {
    throw new Error("offline")
  }
  const { attempt, posts, advance } = harness(() => reply())
  const start = Date.UTC(2026, 10, 28, 12, 0, 0)
  assert.deepEqual(await attempt(), { kind: "failed", at: start, message: "offline" })
  advance(10 * 1000)
  await attempt({ totals: { score: 101, qsos: 11 } })
  assert.equal(posts().length, 1, "a contact logged right after does not post again")
  advance(50 * 1000)
  reply = () => ({ status: 502, body: "<html><body>Bad Gateway</body></html>" })
  assert.deepEqual(await attempt(), { kind: "failed", at: start + 60 * 1000, message: "HTTP 502" })
  advance(60 * 1000)
  reply = () => ({ status: 200, body: OK })
  assert.equal((await attempt())?.kind, "posted")
  assert.equal(posts().length, 3)
})

test("a contest the board does not take is said so, and a contest list that cannot be read is a failure", async () => {
  const { attempt, posts } = harness()
  assert.deepEqual(await attempt({ headers: { CONTEST: "NY-QSO-PARTY" } }), { kind: "notOnBoard", contestId: "NY-QSO-PARTY" })
  assert.equal(posts().length, 0)

  const down = harness(undefined, () => ({ status: 503, body: "" }))
  assert.deepEqual(await down.attempt(), { kind: "failed", at: Date.UTC(2026, 10, 28, 12, 0, 0), message: "the board's contest list answered HTTP 503" })
  assert.equal(down.posts().length, 0)
})

const picker = (selected: string) =>
  `<select name='contest_id'><option value='1'>Closed: Old</option><option value='2'>Closed: CQ WW CW</option>` +
  `<option value='3' ${selected === "3" ? "selected" : ""}>On air: Sprint</option><option value='4'>Coming: NAQP CW</option></select>`

test("the board is found by name first, then among the contests on the air, coming and closed", async () => {
  const pages: Record<string, string> = {
    "https://contestonlinescore.com/scoreboard/": `${picker("3")}<a href="x?contest=SPRINT">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=3": `${picker("3")}<a href="x?contest=SPRINT">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=2": `${picker("2")}<a href="x?contest=CQ-WW-CW">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=1": `${picker("1")}<a href="x?contest=OLD">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=4": `${picker("4")}<a href="x?contest=NAQP-CW">x</a>`,
  }
  const { live, calls } = harness((url) => ({ status: pages[url] ? 200 : 404, body: pages[url] ?? "" }))
  assert.equal(await live.findBoard("cq-ww-cw"), "2")
  // Named alike in the picker, CQ WW CW's board is the first opened.
  assert.deepEqual(
    calls.filter((call) => call.url.includes("contest_id=")).map((call) => call.url.slice(-1)),
    ["2"],
  )
  assert.equal(await live.findBoard("SPRINT"), "3")
  assert.equal(await live.findBoard("NAQP-CW"), "4")
  assert.equal(await live.findBoard("ARRL-DX-CW"), undefined)
})

test("a contest not found is looked for again within minutes, and a picker that cannot be read is a failure", async () => {
  let front = `${picker("3")}<a href="x?contest=SPRINT">x</a>`
  const { live, advance } = harness((url) => ({ status: 200, body: url.endsWith("/scoreboard/") ? front : `${picker("1")}<a href="x?contest=OTHER">x</a>` }))
  assert.equal(await live.findBoard("ARRL-DX-CW"), undefined)
  assert.deepEqual(live.foundNow("ARRL-DX-CW"), { kind: "missing" })
  front = "<html>maintenance</html>"
  advance(6 * 60 * 1000)
  await assert.rejects(live.findBoard("ARRL-DX-CW"), /list of contests could not be read/)
  assert.equal(live.foundNow("ARRL-DX-CW").kind, "failed")
  advance(60 * 1000)
  assert.equal(live.foundNow("ARRL-DX-CW").kind, "searching", "a failed search is tried again a minute on")
  await Promise.allSettled(live.pending())
})

test("a contest the board's list does not have opens no board looking for it", async () => {
  const { live, calls } = harness(() => ({ status: 200, body: `${picker("3")}<a href="x?contest=SPRINT">x</a>` }))
  assert.equal(await live.findBoard("NY-QSO-PARTY"), undefined)
  assert.deepEqual(live.foundNow("NY-QSO-PARTY"), { kind: "missing" })
  assert.equal(calls.filter((call) => call.url.includes("contest_id=")).length, 0)
})

test("a board found closed is looked for again within minutes, one on the air only after an hour", async () => {
  const pages: Record<string, string> = {
    "https://contestonlinescore.com/scoreboard/": `${picker("3")}<a href="x?contest=SPRINT">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=2": `${picker("2")}<a href="x?contest=CQ-WW-CW">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=4": `${picker("4")}<a href="x?contest=NAQP-CW">x</a>`,
  }
  const { live, calls, advance } = harness((url) => ({ status: pages[url] ? 200 : 404, body: pages[url] ?? "" }))
  assert.equal(await live.findBoard("CQ-WW-CW"), "2")
  assert.equal(await live.findBoard("NAQP-CW"), "4")
  const searches = () => calls.filter((call) => call.url.endsWith("/scoreboard/")).length
  const before = searches()
  advance(6 * 60 * 1000)
  await live.findBoard("NAQP-CW")
  assert.equal(searches(), before, "a board coming or on the air is held")
  await live.findBoard("CQ-WW-CW")
  assert.equal(searches(), before + 1, "a closed board may have been followed by a new one")
})

test("a search that fails keeps the board an earlier one found", async () => {
  let up = true
  const pages: Record<string, string> = {
    "https://contestonlinescore.com/scoreboard/": `${picker("3")}<a href="x?contest=SPRINT">x</a>`,
    "https://contestonlinescore.com/scoreboard/?contest_id=4": `${picker("4")}<a href="x?contest=NAQP-CW">x</a>`,
  }
  const { live, advance } = harness((url) => (up && pages[url] ? { status: 200, body: pages[url] } : { status: 503, body: "" }))
  assert.equal(await live.findBoard("NAQP-CW"), "4")
  up = false
  advance(61 * 60 * 1000)
  await assert.rejects(live.findBoard("NAQP-CW"))
  assert.deepEqual(live.foundNow("NAQP-CW"), { kind: "found", id: "4" })
  await Promise.allSettled(live.pending())
})

test("a board is drawn from what is held, read in the background", async () => {
  const { live } = harness(() => ({ status: 200, body: `${picker("3")}<a href="x?contest=SPRINT">x</a>` }))
  assert.equal(live.boardNow("3").kind, "loading")
  await Promise.allSettled(live.pending())
  assert.equal(live.boardNow("3").kind, "ready")
})

test("a board that fails is said so, and read again only after a while, however often the panes draw", async () => {
  const { live, calls, advance } = harness(() => ({ status: 500, body: "" }))
  // The panes draw again each time work finishes, as the app's would.
  live.onChange = () => void live.boardNow("9")
  live.boardNow("9")
  await Promise.allSettled(live.pending())
  await Promise.allSettled(live.pending())
  assert.deepEqual(live.boardNow("9"), { kind: "failed", message: "HTTP 500" })
  assert.equal(calls.length, 1, "no read again straight after a failure")
  advance(60 * 1000)
  assert.equal(live.boardNow("9").kind, "loading")
  await Promise.allSettled(live.pending())
  assert.equal(calls.length, 2)
})

test("a board read before and failing since is still shown, marked as of when it was read", async () => {
  let up = true
  const { live, advance } = harness(() => (up ? { status: 200, body: `${picker("3")}<a href="x?contest=SPRINT">x</a>` } : { status: 503, body: "" }))
  live.boardNow("3")
  await Promise.allSettled(live.pending())
  up = false
  advance(60 * 1000)
  live.boardNow("3")
  await Promise.allSettled(live.pending())
  const state = live.boardNow("3")
  assert.equal(state.kind, "ready")
  assert.deepEqual(state.kind === "ready" && state.stale, { since: Date.UTC(2026, 10, 28, 12, 0, 0), message: "HTTP 503" })
})

test("a search whose boards could not be read fails rather than finding nothing", async () => {
  const front = `${picker("3")}<a href="x?contest=SPRINT">x</a>`
  const { live } = harness((url) => (url.endsWith("/scoreboard/") ? { status: 200, body: front } : { status: 503, body: "" }))
  await assert.rejects(live.findBoard("ARRL-DX-CW"), /could not be read/)
  assert.equal(live.foundNow("ARRL-DX-CW").kind, "failed")
})

test("a post an overlapping call already made is not made again", async () => {
  const { live, posts } = harness(() => ({ status: 401, body: "" }))
  const ready = {
    operationUuid: "op-1",
    call: "KI2D",
    password: "secret",
    headers: { CONTEST: "CQ-WW-CW" },
    totals: { score: 100 },
    qsos: [],
    breakdown: true,
    everyMs: POST_EVERY_MS,
    qth: {},
    soft: "Ham2K Logger",
    version: "0.1.0",
  }
  // Both calls found the post due before either started it.
  assert.ok(live.due("op-1", "KI2D|cqww|secret"))
  live.startPost(ready, "KI2D|cqww|secret")
  await Promise.allSettled(live.pending())
  live.startPost(ready, "KI2D|cqww|secret")
  await Promise.allSettled(live.pending())
  assert.equal(posts().length, 1)
})

test("a contest's settings are part of the attempt, so a refusal is asked again once they change", () => {
  // CQ WW's mode picks CQ-WW-CW or CQ-WW-SSB: one closed is no reason to
  // wait half an hour once the operation is set to the other.
  const cqww = (mode: string) => ({ type: "cqww", ref: { type: "cqww", contest: true, mode } })
  assert.notEqual(attemptOf("KI2D", cqww("CW"), "secret"), attemptOf("KI2D", cqww("SSB"), "secret"))
  assert.equal(attemptOf("KI2D", cqww("CW"), "secret"), attemptOf("KI2D", cqww("CW"), "secret"))
  assert.notEqual(attemptOf("KI2D", cqww("CW"), "secret"), attemptOf("KI2D", cqww("CW"), "corrected"))
})

test("the operation's contest is the ref the app marks as one", () => {
  assert.deepEqual(contestRefOf({ refs: [{ type: "potaActivation", ref: "US-1" }, { type: "cqww", contest: true }] })?.type, "cqww")
  assert.equal(contestRefOf({ refs: [{ type: "cqww" }] }), undefined)
  assert.equal(contestRefOf({}), undefined)
})

test("the totals are the contest scorer's operation tally", () => {
  const scores = {
    core: { qsoCount: { key: "qsoCount", for: "operation" as const, total: 12 } },
    "ham2k-cqww": { cqww: { key: "cqww", for: "operation" as const, total: 4200, qsos: 120, points: 300, mults: 14 } },
  }
  assert.deepEqual(totalsOf(scores, "ham2k-cqww"), { score: 4200, qsos: 120, points: 300, mults: 14 })
  assert.equal(totalsOf(scores, "ham2k-naqp"), undefined)
  assert.equal(totalsOf(null, "ham2k-cqww"), undefined)
})

test("the log's last contact leaves out deleted ones", () => {
  assert.equal(lastContactAt([{ startAtMillis: 10 }, { startAtMillis: 30, deleted: true }, { startAtMillis: 20 }]), 20)
  assert.equal(lastContactAt([]), undefined)
})
