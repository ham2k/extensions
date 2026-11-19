// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What the contest's own Cabrillo export says of an operation: the header
// lines a post sends (categories, club, operators) and the contest's id,
// which names its board (`CONTEST: CQ-WW-SSB`).
//
// An export is the whole log, so its header is kept and read again only once
// what it is made from changes: the contest's settings, where a mode or an
// event picks the id; the station's calls and grid; and the calls the
// contacts were made by, which its OPERATORS line lists. Some exporters also
// take a line from the operator's profile (a CLUB), which nothing here can
// watch, so a header is read again after half an hour all the same.

import type { JSONValue } from "@ham2k/extension-sdk"

import type { ContestRef } from "./live.ts"
import { cabrilloHeaders } from "./post.ts"

type Qso = Record<string, JSONValue>

export const HEADER_FRESH_MS = 30 * 60 * 1000

export interface LogHeader {
  headers: Record<string, string>
  /// The contest's id, the first word of its `CONTEST:` line.
  cabrilloId?: string
}

/// The operation's part of what a header is made from.
export function setupOf(operation: Qso, contest: ContestRef): string {
  const local = operation.local as Qso | undefined
  return JSON.stringify([contest.type, contest.ref, operation.stationCall ?? null, operation.operatorCall ?? null, local?.operatorCall ?? null, operation.grid ?? null])
}

/// The calls the log's contacts were made by, in order.
export function operatorsOf(qsos: Qso[]): string {
  const calls = new Set<string>()
  for (const qso of qsos) {
    if (qso.deleted === true) continue
    const our = (qso.our as Qso | undefined) ?? {}
    const call = typeof our.operatorCall === "string" && our.operatorCall.trim() ? our.operatorCall : our.call
    if (typeof call === "string" && call.trim()) calls.add(call.trim().toUpperCase())
  }
  return [...calls].sort().join(" ")
}

interface Held {
  setup: string
  operators: string
  at: number
  header: LogHeader
}

/// Each operation's header, by operation and contest.
export class HeaderStore {
  private readonly held = new Map<string, Held>()
  private readonly now: () => number

  constructor(now: () => number) {
    this.now = now
  }

  /// The header held for the operation's contest while what it was made from
  /// still holds. With [qsos], its OPERATORS line must also still name the
  /// log's operators, as a post sends it; a pane needs only the contest's id.
  get(uuid: string, operation: Qso, contest: ContestRef, qsos?: Qso[]): LogHeader | undefined {
    const held = this.held.get(`${uuid}|${contest.type}`)
    if (!held || this.now() - held.at >= HEADER_FRESH_MS || held.setup !== setupOf(operation, contest)) return undefined
    if (qsos && held.operators !== operatorsOf(qsos)) return undefined
    return held.header
  }

  /// Keeps the header of the [log] exported from [operation] and [qsos].
  set(uuid: string, operation: Qso, contest: ContestRef, qsos: Qso[], log: string): LogHeader {
    const headers = cabrilloHeaders(log)
    const header = { headers, cabrilloId: headers.CONTEST?.split(/\s+/)[0] || undefined }
    this.held.set(`${uuid}|${contest.type}`, { setup: setupOf(operation, contest), operators: operatorsOf(qsos), at: this.now(), header })
    return header
  }
}
