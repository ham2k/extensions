// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The QSO Party APRS Tracker (mobiletracker.stateqso.com): a map of the
// mobiles in a party, built from APRS. A station is on it because its APRS
// comment names the party — `NJQP 14.230` — and its position places it in a
// county. One feed per party, at the party's own path.

import { bandForFrequency, modeForFrequency } from "@ham2k/lib-operation-data"
import { parseFreq } from "@ham2k/lib-format-tools"
import type { QsoPartyIdentity } from "@ham2k/qso-parties/identity"
import type { Spot } from "@ham2k/extension-sdk"

import { partyRef, SPOT_SOURCE } from "./hub.ts"

export const TRACKER_BASE = 'https://mobiletracker.stateqso.com'

/// Undefined for a party the tracker does not carry (the Canadian ones).
export function trackerUrl(party: QsoPartyIdentity): string | undefined {
  return party.trackerCode ? `${TRACKER_BASE}/${party.trackerCode}/stations.geojson` : undefined
}

/// One station on the map. `frequencies` is what the tracker publishes today
/// and `frequency` what it published when app-polo was written against it;
/// both are read so a feed that goes back does not go dark. No timestamp is
/// published — a station is on the feed while its beacon is fresh, which
/// makes every row "now".
interface TrackerProperties {
  call?: string
  frequencies?: string[]
  frequency?: string
  text?: string
  countyCode?: string
  county?: string
  grid?: string
}

interface TrackerFeed {
  features?: { properties?: TrackerProperties }[]
}

export function parseTrackerFeed(json: string, party: QsoPartyIdentity, now: number): Spot[] {
  const feed = JSON.parse(json) as TrackerFeed
  const spots: Spot[] = []
  const seen = new Set<string>()
  for (const feature of feed.features ?? []) {
    const p = feature.properties ?? {}
    const call = (p.call ?? '').toUpperCase().trim()
    if (!call || seen.has(call)) continue
    seen.add(call)

    const freqText = p.frequency ?? p.frequencies?.find((f) => f) ?? ''
    const freq = freqText ? parseFreq(freqText) || undefined : undefined
    const county = (p.countyCode ?? '').toUpperCase().trim()
    // The comment as beaconed, minus the party token and frequency the
    // tracker itself parsed out of it — what is left is what the operator
    // meant to say.
    const token = party.aprsShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const text = (p.text ?? '').replace(new RegExp(`^${token}\\s*[\\d.]*\\s*`, 'i'), '').trim()

    spots.push({
      their: { call },
      freq,
      band: freq ? bandForFrequency(freq) : undefined,
      mode: freq ? modeForFrequency(freq, { ituRegion: 2 }) || undefined : undefined,
      refs: county ? [partyRef(party, county)] : [],
      spot: {
        timeInMillis: now,
        source: SPOT_SOURCE,
        label: `${party.short}: ${[county, text].filter((x) => x).join(' • ')}`,
        sourceInfo: {
          source: 'Mobile Tracker',
          ...(p.text ? { comments: p.text } : {}),
          spotter: call,
        },
      },
    })
  }
  return spots
}
