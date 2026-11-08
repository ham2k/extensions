// Copyright ©️ 2026 Ian Renton
// SPDX-License-Identifier: MIT
//
// Provides handling of Spothole's data and transformation into spots that Ham2k
// Logger can use on its spots board.

import type { JSONValue, Spot, SpotRef } from "@ham2k/extension-sdk"
import { bandForFrequency, modeForFrequency } from "@ham2k/lib-operation-data"

export const API_BASE = 'https://spothole.app/api/v3'
export const SPOT_SOURCE = 'spothole'
export const MAX_AGE_MILLIS = 60 * 60 * 1000
export const MAX_SPOTS = 2000

/// Request only the subset of fields from Spothole that we actually need
export const FIELDS = [
  'dx_call', 'de_call', 'freq', 'mode', 'time', 'received_time',
  'comment', 'activities', 'activity_refs', 'qrt', 'source',
]

/// Spothole data for an activity reference inside a spot
export interface SpotholeRef {
  activity?: string
  id?: string
  name?: string
}

/// Spothole data for a single spot
export interface SpotholeSpot {
  dx_call?: string
  de_call?: string
  /// Frequency in Hz
  freq?: number
  mode?: string | null
  /// Spot time, float seconds since UNIX epoch
  time?: number
  /// Time when Spothole received it
  received_time?: number
  comment?: string | null
  /// Activity names
  activities?: string[]
  /// Activity refs
  activity_refs?: SpotholeRef[]
  qrt?: boolean | null
  /// Where Spothole got the spot. We could maybe use this in future to skip spots which Ham2K Logger is
  /// already set up to receive (e.g. POTA) to avoid duplicates.
  source?: string
}

/// Map of Spothole's activity names to the HUNTING ref type, so we can identify
/// the right activity within the logger.
/// An activity missing here still reaches the board, but we put the activity in
/// the comment if Ham2k Logger doesn't understand what it is.
export const ACTIVITY_NAME_MAP: Record<string, string> = {
  POTA: 'pota',
  SOTA: 'sota',
  WWFF: 'wwff',
  WWBOTA: 'wwbota',
  GMA: 'gma',
  ZLOTA: 'zlota',
  LLOTA: 'llota',
  HOTA: 'hota',
  PPOTA: 'ppota',
  SIOTA: 'siota',
  MOTA: 'mota',
  Tiles: 'tiles',
  Towers: 'tota',
}

/// Parses an answer from `/spots`. Anything but a JSON array causes an error to be thrown,
/// which `fetchSpots` catches and logs, keeping the spots it already holds
export function parseSpots(body: string): SpotholeSpot[] {
  const parsed = JSON.parse(body) as unknown
  if (!Array.isArray(parsed)) throw new Error('Spothole did not return a list of spots')
  return parsed as SpotholeSpot[]
}

/// Convert a Spothole spot into a Ham2k Logger spot
export function spotFromSpothole(record: SpotholeSpot): Spot | undefined {
  // Bail if no callsign
  const call = (record.dx_call ?? '').trim().toUpperCase()
  if (!call || typeof record.time !== 'number') return undefined

  // Convert Hz to kHz
  const freq = typeof record.freq === 'number' && record.freq > 0 ? record.freq / 1000 : undefined

  // Map activities
  const refs: SpotRef[] = []
  const unmapped: string[] = []
  for (const ref of record.activity_refs ?? []) {
    const id = (ref.id ?? '').trim()
    if (!id || !ref.activity) continue
    const type = ACTIVITY_NAME_MAP[ref.activity]
    if (type) {
      refs.push({ type, ref: id.toUpperCase() })
    } else {
      unmapped.push(`${ref.activity} ${id}`)
    }
  }

  // The label is the line the board shows under the callsign. If we are dealing
  // with an activity Ham2k Logger doesn't know about, prepend the information to
  // the comment, otherwise just use the comment.
  const activitiesWithoutRefs = (record.activities ?? [])
    .filter((name) => !ACTIVITY_NAME_MAP[name] && !unmapped.some((text) => text.startsWith(`${name} `)))
  const comment = (record.comment ?? '').trim()
  const label = [...unmapped, ...activitiesWithoutRefs, comment].filter((part) => part).join(' · ')

  const sourceInfo: Record<string, JSONValue> = {}
  if (comment) sourceInfo.comments = comment
  if (record.de_call) sourceInfo.spotter = record.de_call.trim().toUpperCase()
  if (record.source) sourceInfo.via = record.source
  if (record.qrt) sourceInfo.qrt = true

  return {
    their: { call },
    freq,
    band: freq ? bandForFrequency(freq) : undefined,
    // If Spothole doesn't have a mode, let Logger guess one
    mode: record.mode?.trim().toUpperCase() || (freq ? modeForFrequency(freq) || undefined : undefined),
    refs,
    spot: {
      timeInMillis: Math.round(record.time * 1000),
      source: SPOT_SOURCE,
      label: label || undefined,
      sourceInfo,
    },
  }
}

/// Store of the newest spot for each callsign, band and mode, so a station
/// that moves within a band is shown where it was last spotted, and one on
/// two bands is on both. Based on DX cluster handling code
export class SpotStore {
  private held = new Map<string, Spot>()

  /// The newest `received_time` seen. The next poll asks only for what
  /// arrived after it. Undefined until the first poll succeeds, and after
  /// everything held has expired.
  cursor: number | undefined

  add(records: SpotholeSpot[]): void {
    for (const record of records) {
      if (typeof record.received_time === 'number' && (this.cursor === undefined || record.received_time > this.cursor)) {
        this.cursor = record.received_time
      }
      const spot = spotFromSpothole(record)
      if (!spot) continue
      const key = `${spot.their.call}|${spot.band ?? ''}|${spot.mode ?? ''}`
      const current = this.held.get(key)
      if (!current || spot.spot.timeInMillis >= current.spot.timeInMillis) this.held.set(key, spot)
    }
  }

  /// Drops every spot older than `MAX_AGE_MILLIS`. Once nothing is left, the
  /// cursor is dropped too, so the next poll asks for the whole hour again rather
  /// than for "since" a time the server has already forgotten.
  prune(now: number): void {
    for (const [key, spot] of this.held) {
      if (now - spot.spot.timeInMillis > MAX_AGE_MILLIS) this.held.delete(key)
    }
    if (this.held.size === 0) this.cursor = undefined
  }

  spots(): Spot[] {
    return [...this.held.values()]
      .filter((spot) => !spot.spot.sourceInfo?.qrt)
      .sort((a, b) => b.spot.timeInMillis - a.spot.timeInMillis)
      .slice(0, MAX_SPOTS)
  }
}

/// The URL for the next poll: the last hour on the first poll, then only what
/// is new after that.
export function spotsUrl(cursor: number | undefined): string {
  const params = [`fields=${FIELDS.join(',')}`]
  if (cursor === undefined) {
    params.push(`max_age=${MAX_AGE_MILLIS / 1000}`)
  } else {
    params.push(`received_since=${cursor}`)
  }
  return `${API_BASE}/spots?${params.join('&')}`
}
