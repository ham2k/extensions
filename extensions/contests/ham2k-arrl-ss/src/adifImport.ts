// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Recover the exchange this extension writes to ADIF. The contest ID owns the
// vocabulary: an ARRL_SECT on another contest's record is not Sweepstakes.
// Only the contact's fields belong here. In particular, U and M do not tell
// us the power category, so an import never invents an operation's entry.

import type { AdifImportHook, AdifImportResult, Ref } from "@ham2k/extension-sdk"

import { normalizeCheck, normalizePrecedence } from "./entry.ts"
import { normalizeSection } from "./exchange.ts"
import { TYPE } from "./scorer.ts"

const CONTEST_IDS = ['ARRL-SS-CW', 'ARRL-SS-SSB', 'ARRL-SS']

type Exchange = { serial: string; precedence: string; check: string; section: string }

/// The four parts this extension writes, or the full on-air exchange when
/// its callsign agrees with the record. Refuse a partial or reordered string
/// rather than shifting its remaining words into the wrong fields.
///
/// Shape, not validity: "43 X 7 ILL" still has four unmistakable parts, and
/// keeping them lets the existing fields and scorer expose the mistakes.
function exchangeFrom(value: string | undefined, call: string | undefined): Exchange | undefined {
  const tokens = value?.trim().split(/\s+/) ?? []
  if (tokens.length === 5) {
    if (!call?.trim() || tokens[2].toUpperCase() !== call.trim().toUpperCase()) return undefined
    tokens.splice(2, 1)
  }
  if (tokens.length !== 4) return undefined
  const [serial, precedence, check, section] = tokens
  if (!/^\d+$/.test(serial) || !/^[a-z]$/i.test(precedence) || !/^\d+$/.test(check) || !/^[a-z]+$/i.test(section)) return undefined
  return { serial, precedence, check, section }
}

/// Presence wins, even for a deliberate blank or a malformed value. Falling
/// back because a dedicated field is invalid would quietly replace what the
/// file actually said with a conflicting exchange string.
function valueFor(fields: Record<string, string>, key: string, fallback: string | undefined): string | undefined {
  return Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : fallback
}

function importRecord(fields: Record<string, string>): AdifImportResult | null {
  if (!CONTEST_IDS.includes((fields.contest_id ?? '').trim().toUpperCase())) return null

  const ours = exchangeFrom(fields.stx_string, fields.station_callsign)
  const theirs = exchangeFrom(fields.srx_string, fields.call)
  // The host's importer requires a string `ref`. Empty is intentional: these
  // are the same arrl-ss refs normal logging writes without a `ref` value.
  const ref: Ref = { type: TYPE, ref: '' }
  const serials = [
    ['ourSerial', valueFor(fields, 'stx', ours?.serial)],
    ['theirSerial', valueFor(fields, 'srx', theirs?.serial)],
  ] as const
  for (const [key, value] of serials) {
    if (value !== undefined) ref[key] = value
  }

  const received = [
    ['theirPrecedence', valueFor(fields, 'precedence', theirs?.precedence), normalizePrecedence],
    ['theirCheck', valueFor(fields, 'check', theirs?.check), normalizeCheck],
    ['theirSection', valueFor(fields, 'arrl_sect', theirs?.section), normalizeSection],
  ] as const
  for (const [key, value, normalize] of received) {
    if (value !== undefined) ref[key] = normalize(value) || value
  }
  return { refs: [ref] }
}

export const SSAdifImportHook: AdifImportHook = {
  async refsForRecords({ records }, _ctx) {
    return records.map(({ fields }) => importRecord(fields ?? {}))
  },
}
