// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The trap here is invisible from anywhere else in the extension: "first
// COMPLETE weekend" excludes a Saturday whose Sunday falls in October, which
// moves the event a week whenever September opens on a Sunday.

import { strict as assert } from "node:assert"
import { describe, it } from "node:test"

import {
  daysUntilFieldDay,
  endOfFieldDay,
  isFieldDayOn,
  nextRunningYear,
  relevanceFor,
  startOfFieldDay,
} from "./schedule.ts"
import manifest from "../manifest.json" with { type: "json" }

describe('startOfFieldDay', () => {
  it('opens 1300 UTC on the first full September weekend', () => {
    assert.equal(startOfFieldDay(2026), Date.UTC(2026, 8, 5, 13, 0))
    // 2025: September 1 is a Monday, so the first Saturday is the 6th.
    assert.equal(startOfFieldDay(2025), Date.UTC(2025, 8, 6, 13, 0))
    // 2024: September 1 is a Sunday — the 7th starts the first COMPLETE
    // weekend, and a naive "first Saturday" would agree here by luck.
    assert.equal(startOfFieldDay(2024), Date.UTC(2024, 8, 7, 13, 0))
  })

  it('runs a clean 24 hours, to Sunday 1300 UTC', () => {
    assert.equal(endOfFieldDay(2026), Date.UTC(2026, 8, 6, 13, 0))
    assert.equal(endOfFieldDay(2026) - startOfFieldDay(2026), 24 * 60 * 60 * 1000)
  })
})

describe('nextRunningYear', () => {
  it('rolls to next year only a fortnight after the running', () => {
    const justAfter = endOfFieldDay(2026) + 24 * 60 * 60 * 1000
    assert.equal(nextRunningYear(justAfter), 2026)
    const aMonthAfter = endOfFieldDay(2026) + 30 * 24 * 60 * 60 * 1000
    assert.equal(nextRunningYear(aMonthAfter), 2027)
  })
})

describe('relevance', () => {
  it('peaks while on the air, stays high just after, and decays with distance', () => {
    const during = startOfFieldDay(2026) + 60 * 60 * 1000
    assert.equal(isFieldDayOn(during), true)
    assert.equal(relevanceFor(during), 1)

    const dayAfter = endOfFieldDay(2026) + 24 * 60 * 60 * 1000
    assert.equal(relevanceFor(dayAfter), 0.9)

    const monthsBefore = startOfFieldDay(2026) - 120 * 24 * 60 * 60 * 1000
    assert.ok(relevanceFor(monthsBefore) < 0.5)
    assert.ok(daysUntilFieldDay(monthsBefore) > 100)
  })
})

// The manifest's `relevance.dates` is a hand-typed copy of what this module
// computes, and the catalog reads it without ever loading the bundle. Nothing
// else compares the two, so a fix to the rule here would move the scorer and
// leave the listing advertising the old weekend — the exact failure the QSO
// parties avoid by deriving their dates from `periods`.
describe("the manifest's dates", () => {
  it('are the ones this rule computes', () => {
    const listed = (manifest.relevance?.dates ?? []) as string[]
    assert.ok(listed.length > 0, 'the manifest lists no dates')
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    assert.deepEqual(listed, listed.map((d) => startOfFieldDay(Number(d.slice(0, 4)))).map(day))
  })
})
