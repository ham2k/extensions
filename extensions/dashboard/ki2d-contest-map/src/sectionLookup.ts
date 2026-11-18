// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The ARRL or RAC section a station is in, as far as what is known of it says: the section itself
// where it carries one, the section its place falls in where that place is precise, or its state's
// or province's where that is a section on its own.
import { entityPrefixForCall } from '@ham2k/extension-sdk'
import { gridToLocation } from '@ham2k/lib-geo-tools'

import { SECTION_SHAPES } from './arrlSections.ts'

/** The states and provinces that are one section each (most of them), and that section. */
const SECTION_FOR_STATE: Record<string, string> = {
  AL: 'AL', AK: 'AK', AZ: 'AZ', AR: 'AR', CO: 'CO', CT: 'CT', DE: 'DE', DC: 'MDC', GA: 'GA', HI: 'PAC', ID: 'ID', IL: 'IL',
  IN: 'IN', IA: 'IA', KS: 'KS', KY: 'KY', LA: 'LA', ME: 'ME', MD: 'MDC', MI: 'MI', MN: 'MN', MS: 'MS', MO: 'MO', MT: 'MT',
  NE: 'NE', NV: 'NV', NH: 'NH', NM: 'NM', NC: 'NC', ND: 'ND', OH: 'OH', OK: 'OK', OR: 'OR', PR: 'PR', RI: 'RI', SC: 'SC',
  SD: 'SD', TN: 'TN', UT: 'UT', VT: 'VT', VA: 'VA', VI: 'VI', WV: 'WV', WI: 'WI', WY: 'WY',
  AB: 'AB', BC: 'BC', MB: 'MB', NB: 'NB', NL: 'NL', NS: 'NS', PE: 'PE', QC: 'QC', SK: 'SK', YT: 'TER', NT: 'TER', NU: 'TER',
}

/** The ARRL and RAC sections' names, as the Sweepstakes extension has them. */
export const SECTION_NAMES: Record<string, string> = {
  AK: "Alaska",
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  EB: "East Bay",
  EMA: "Eastern Massachusetts",
  ENY: "Eastern New York",
  EPA: "Eastern Pennsylvania",
  EWA: "Eastern Washington",
  GA: "Georgia",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  LAX: "Los Angeles",
  MDC: "Maryland & DC",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NFL: "Northern Florida",
  NH: "New Hampshire",
  NLI: "New York City & Long Island",
  NM: "New Mexico",
  NNJ: "Northern New Jersey",
  NNY: "Northern New York",
  NTX: "North Texas",
  NV: "Nevada",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  ORG: "Orange",
  PAC: "Pacific",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SB: "Santa Barbara",
  SC: "South Carolina",
  SCV: "Santa Clara Valley",
  SD: "South Dakota",
  SDG: "San Diego",
  SF: "San Francisco",
  SFL: "Southern Florida",
  SJV: "San Joaquin Valley",
  SNJ: "Southern New Jersey",
  STX: "South Texas",
  SV: "Sacramento Valley",
  TN: "Tennessee",
  UT: "Utah",
  VA: "Virginia",
  VI: "US Virgin Islands",
  VT: "Vermont",
  WCF: "West Central Florida",
  WI: "Wisconsin",
  WMA: "Western Massachusetts",
  WNY: "Western New York",
  WPA: "Western Pennsylvania",
  WTX: "West Texas",
  WV: "West Virginia",
  WWA: "Western Washington",
  WY: "Wyoming",
  AB: "Alberta",
  BC: "British Columbia",
  GH: "Golden Horseshoe",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland/Labrador",
  NS: "Nova Scotia",
  ONE: "Ontario East",
  ONN: "Ontario North",
  ONS: "Ontario South",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  TER: "Territories",
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase() : '')

let boxes: [string, number, number, number, number][] | undefined
/** Each section's extent, south, north, west, east, to try only the ones a place could be in. */
function sectionBoxes() {
  return (boxes ??= Object.entries(SECTION_SHAPES).map(([section, rings]) => {
    let south = 90, north = -90, west = 180, east = -180
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        south = Math.min(south, ring[i]); north = Math.max(north, ring[i])
        west = Math.min(west, ring[i + 1]); east = Math.max(east, ring[i + 1])
      }
    }
    return [section, south, north, west, east]
  }))
}

/** The section whose outline holds a place, even-odd over its rings; none outside them all. */
export function sectionAt(lat: number, lon: number): string | undefined {
  for (const [section, south, north, west, east] of sectionBoxes()) {
    if (lat < south || lat > north || lon < west || lon > east) continue
    let inside = false
    for (const ring of SECTION_SHAPES[section]) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const [y0, x0, y1, x1] = [ring[i], ring[i + 1], ring[j], ring[j + 1]]
        if (y0 > lat !== y1 > lat && lon < x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside
      }
    }
    if (inside) return section
  }
  return undefined
}

function preciseSpot(their: Record<string, unknown>): [number, number] | undefined {
  const guess = obj(their.guess)
  for (const where of [their, guess]) {
    if (finite(where.lat) && finite(where.lon)) return [where.lat, where.lon]
    if (typeof where.grid === 'string' && where.grid.length >= 4 && !/^AA00/i.test(where.grid)) {
      try {
        const [lat, lon] = gridToLocation(where.grid)
        if (finite(lat) && finite(lon)) return [lat, lon]
      } catch {}
    }
  }
  return undefined
}

/**
 * The section a station (a contact's or a spot's `their`) is in, or nothing where that cannot be
 * told: a split state with no place more precise than the state, or a station outside the US and
 * Canada, whose states and provinces share some of these letters.
 */
export function sectionForStation(theirs: unknown): string | undefined {
  const their = obj(theirs), guess = obj(their.guess)
  const stated = text(their.arrlSection) || text(guess.arrlSection)
  if (stated) return stated
  const call = text(their.call), entity = call ? entityPrefixForCall(call) ?? '' : ''
  if (!/^(K|VE|VO|VY)/.test(entity)) return undefined
  const place = preciseSpot(their)
  const found = place && sectionAt(place[0], place[1])
  if (found) return found
  return SECTION_FOR_STATE[text(their.state) || text(guess.state)]
}
