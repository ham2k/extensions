// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What one QSO says in the file the sponsor checks.
//
// The sponsor reads two fields for the parks — "Your park (MY_SIG_INFO)" and,
// "if the station you worked is in a WI park, then their US-POTA park number
// (SIG_INFO)" — and those are POTA's field names. They are written HERE, from
// the same `ourPark`/`theirPark` the scorer counts by, and POTA's own hook is
// NOT asked to ride along, because it answers a different question:
//
//   * it returns one field set PER hunted reference, and the exporter writes a
//     record for each, so a station at a POTA two-fer would be two QSOs in the
//     file and one on the score panel;
//   * its `MY_SIG_INFO` is the first activation reference, Wisconsin or not,
//     where the score credits the first WISCONSIN one.
//
// Either way the operator would type counts into the sponsor's form that the
// file beside them does not support. One scored QSO is one record, naming the
// parks that were scored.

import type { JSONValue } from "@ham2k/extension-sdk"

import { ourPark, theirPark } from "./parks.ts"

export function adifFieldsFor(
  contest: string,
  qso: Record<string, JSONValue> | undefined,
  operation: Record<string, JSONValue> | undefined,
): { name: string; value: string }[] {
  const fields = [{ name: 'CONTEST_ID', value: contest }]

  // Each pair whole or not at all: the exporter picks a winner per field NAME,
  // so a `MY_SIG` without its `MY_SIG_INFO` would take the name from another
  // program and leave that program's reference orphaned.
  const ours = ourPark(operation)
  if (ours) fields.push({ name: 'MY_SIG', value: 'POTA' }, { name: 'MY_SIG_INFO', value: ours })
  const theirs = theirPark(qso)
  if (theirs) fields.push({ name: 'SIG', value: 'POTA' }, { name: 'SIG_INFO', value: theirs })

  return fields
}
