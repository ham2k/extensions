// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Run with `node --experimental-strip-types --test` (see package.json).

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  defineQsoParty,
  qsoPartyActivity,
  qsoPartyAdifFields,
  qsoPartyExport,
  qsoPartyRefHandler,
  qsoPartyScorer,
} from "./index.ts"
import type { QsoPartyParams } from "./params.ts"

const PARAMS: QsoPartyParams = {
  refType: 'test-qso-party',
  name: 'Test QSO Party',
  short: 'TESTQP',
  state: 'TX',
  periods: [{ startMillis: Date.UTC(2026, 8, 26, 14), endMillis: Date.UTC(2026, 8, 27, 2) }],
  counties: { ANDER: 'Anderson', ANDRE: 'Andrews' },
}

// An unimplemented generator has to FAIL, not answer with nothing: a stub that
// returned undefined would let an extension register a hook that is not there,
// and the host would carry on with an activity that scores nothing and says why
// nowhere. Each generator is replaced by its implementation, and this test with
// it.
test("every generator refuses until it is implemented", () => {
  const generators = [
    qsoPartyScorer,
    qsoPartyActivity,
    qsoPartyRefHandler,
    qsoPartyAdifFields,
    qsoPartyExport,
    defineQsoParty,
  ]
  for (const generate of generators) {
    assert.throws(() => generate(PARAMS), /not implemented/)
  }
})
