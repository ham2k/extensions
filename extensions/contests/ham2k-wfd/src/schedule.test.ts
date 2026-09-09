// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Winter Field Day's date rule, which is pure arithmetic over a calendar and was
// shipped with no test at all — `saturdays[3]` becoming `[2]`, or a 0-based
// month slipping by one, moves the contest a week or a month with nothing to
// catch it.
//
// Colocated `.test.ts`, run by `npm test`, the way `stateparks/src/events.test.ts`
// covers its own `daysUntil`.

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  daysUntilWinterFieldDay,
  endOfWinterFieldDay,
  isWinterFieldDayOn,
  nextRunningYear,
  relevanceFor,
  startOfWinterFieldDay,
} from "./schedule.ts"
import manifest from "../manifest.json" with { type: "json" }

/// The runnings as published, so the rule is checked against reality
/// rather than against itself.
const PUBLISHED: [number, number, number][] = [
  [2024, 1, 27], [2025, 1, 25], [2026, 1, 24], [2027, 1, 30], [2028, 1, 29],
]

test("lands on the published weekend for each year", () => {
  for (const [year, month, day] of PUBLISHED) {
    const start = new Date(startOfWinterFieldDay(year))
    assert.equal(start.getUTCFullYear(), year)
    assert.equal(start.getUTCMonth() + 1, month, `${year} month`)
    assert.equal(start.getUTCDate(), day, `${year} day`)
    // Always a Saturday, and its Sunday is in the same month — the "full
    // weekend" rule, which is what excludes a month-ending Saturday.
    assert.equal(start.getUTCDay(), 6, `${year} is a Saturday`)
    assert.equal(new Date(start.getTime() + 86400000).getUTCMonth() + 1, month)
  }
})

test("the event ends after it starts, within the same weekend", () => {
  for (const [year] of PUBLISHED) {
    const span = endOfWinterFieldDay(year) - startOfWinterFieldDay(year)
    assert.ok(span > 0 && span <= 30 * 60 * 60 * 1000, `${year} span`)
  }
})

test("nextRunningYear rolls a fortnight after the event, not before", () => {
  const [year, month, day] = PUBLISHED[1]
  const during = startOfWinterFieldDay(year) + 60 * 60 * 1000
  assert.equal(nextRunningYear(during), year, "on the air")
  assert.equal(nextRunningYear(endOfWinterFieldDay(year) + 13 * 86400000), year, "13 days after")
  assert.equal(nextRunningYear(endOfWinterFieldDay(year) + 15 * 86400000), year + 1, "15 days after")
  void month; void day
})

test("the label and the ranking never disagree about which running it is", () => {
  // They used to be decided separately, against different ends of the event,
  // and disagreed for the ~27 hours in between: the picker offered next year's
  // running while ranking it as if it were on the air.
  for (const [year] of PUBLISHED) {
    for (let hour = -40; hour <= 40; hour += 1) {
      const at = endOfWinterFieldDay(year) + 14 * 86400000 + hour * 60 * 60 * 1000
      const labelled = nextRunningYear(at)
      const ranked = at + daysUntilWinterFieldDay(at) * 86400000
      assert.equal(new Date(ranked).getUTCFullYear(), labelled,
        `${year} @ ${hour}h: label says ${labelled}`)
    }
  }
})

test("relevance peaks while it is on and decays afterwards", () => {
  const [year] = PUBLISHED[1]
  const during = startOfWinterFieldDay(year) + 60 * 60 * 1000
  assert.equal(isWinterFieldDayOn(during), true)
  assert.equal(relevanceFor(during), 1)
  // The fortnight after is high but NOT the on-air score — without the isOn
  // term it sat at a full 1 for two weeks after the contest finished.
  const after = endOfWinterFieldDay(year) + 3 * 86400000
  assert.ok(relevanceFor(after) < 1 && relevanceFor(after) > 0.5)
  // Half a year out ranks well below either.
  const distant = startOfWinterFieldDay(year) - 180 * 86400000
  assert.ok(relevanceFor(distant) < 0.5)
})

// The manifest's `relevance.dates` is a hand-typed copy of what this module
// computes, and the catalog reads it without ever loading the bundle. Nothing
// else compares the two, so a fix to the rule here would move the scorer and
// leave the listing advertising the old weekend — the exact failure the QSO
// parties avoid by deriving their dates from `periods`.
test("the manifest's dates are the ones this rule computes", () => {
  const listed = (manifest.relevance?.dates ?? []) as string[]
  assert.ok(listed.length > 0, "the manifest lists no dates")
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  assert.deepEqual(listed, listed.map((d) => startOfWinterFieldDay(Number(d.slice(0, 4)))).map(day))
})
