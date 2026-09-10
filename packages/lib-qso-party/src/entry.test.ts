// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Which reference a party answers for. Its own type, and the pair the bundled
// extension wrote before there was one extension per event — those operations
// are not migrated, so every read has to find either shape.

import assert from "node:assert/strict"
import { test } from "node:test"

import { partyRefIn } from "./entry.ts"
import type { Party } from "./party.ts"

function party(refType: string, legacyRefs?: { type: string; prefix: string }[]): Party {
  return { refType, legacyRefs, name: refType, short: refType, entryClasses: {} } as unknown as Party
}

const NY = party("ny-qso-party", [{ type: "qp", prefix: "ny" }])

test("a party finds a reference of its own type", () => {
  const operation = { refs: [{ type: "ny-qso-party", location: "ALB" }] }
  assert.equal(partyRefIn(NY, operation)?.location, "ALB")
})

test("a party reaches back for the pair the bundled extension wrote", () => {
  // The whole point: nothing rewrote this operation, and the party has to
  // drive it as it stands — location, entry class, exchange and all.
  const operation = { refs: [{ type: "qp", ref: "NY", location: "ALB" }] }
  assert.equal(partyRefIn(NY, operation)?.location, "ALB")
})

test("the code is matched case-folded, because it was hand-typed", () => {
  assert.ok(partyRefIn(NY, { refs: [{ type: "qp", ref: "ny" }] }))
  assert.ok(partyRefIn(NY, { refs: [{ type: "qp", ref: "Ny" }] }))
})

test("another party's legacy reference is not this one's", () => {
  // Fifty parties each claim `qp/<their own>`. Read as a claim on the bare
  // type, every one of them would answer for every other one's operations.
  assert.equal(partyRefIn(NY, { refs: [{ type: "qp", ref: "TX" }] }), undefined)
  // And a `qp` reference with no code at all begins no prefix.
  assert.equal(partyRefIn(NY, { refs: [{ type: "qp" }] }), undefined)
})

test("a prefix claim covers the codes filed under it", () => {
  assert.ok(partyRefIn(NY, { refs: [{ type: "qp", ref: "NY-ALB" }] }))
})

test("the party's own type wins where an operation carries both", () => {
  // An operation set up again under the current name. The entry class and
  // exchange the operator can see belong to that reference, not to the one
  // they last touched years ago.
  const operation = {
    refs: [
      { type: "qp", ref: "NY", location: "OLD" },
      { type: "ny-qso-party", location: "NEW" },
    ],
  }
  assert.equal(partyRefIn(NY, operation)?.location, "NEW")
})

test("a party with no legacy claims answers only for its own type", () => {
  const plain = party("cqww")
  assert.equal(partyRefIn(plain, { refs: [{ type: "qp", ref: "CQWW" }] }), undefined)
})
