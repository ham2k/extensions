// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What a QSO party exchange MEANS: turning `ORDES/JEF`, `MD`, `DC` or an empty
// field into the locations a contact is scored and submitted under.
//
// One module, read by the scorer, the entry row, the ADIF and the Cabrillo,
// because the location SCORED has to be the location SUBMITTED — when a scorer
// and a Cabrillo writer resolve the same exchange separately they drift apart
// exactly where the rules are subtle.

import type { JSONValue } from "@ham2k/extension-sdk"

import { entityPrefixForCall } from "./dxcc.ts"
import type { QsoPartyLocation, QsoPartyStanding } from "./params.ts"
import { isInParty, normalizeCode, type Party, stateForCounty } from "./party.ts"
import {
  CANADIAN_PROVINCES,
  DISTRICT_OF_COLUMBIA,
  MARYLAND_AND_DC,
  US_STATES,
} from "./locations.ts"

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/// The entities outside the lower 48 whose stations are still a US STATE, by
/// their COUNTRY-FILE prefix — which is not always what a ham would write.
/// Alaska is `KL`, so a lookup for `KL7` never matches and an Alaskan station
/// whose exchange we could not read would score as DX rather than as the state
/// multiplier it is. `KL7` is kept alongside it because a synced or imported
/// record may carry what app-polo wrote.
const STATE_ENTITIES: Record<string, string> = { KL: 'AK', KL7: 'AK', KH6: 'HI' }

/// The separators a county line may be typed with. A comma is accepted because
/// the operator may well reach for one; the canonical form written back out is
/// the slash, which is what the sponsors' Cabrillo samples use.
const SEPARATORS = /[/,]/

export const COUNTY_LINE_SEPARATOR = '/'

/// Our own standing, at the moment our own exchange is being resolved: it is
/// what that resolution DECIDES, so it cannot also be an input to it.
const UNDECIDED: QsoPartyStanding = { weAreInParty: false, theyAreInParty: false }

/// `ORDES/ORJEF` → `['ORDES', 'ORJEF']`, and the multi-state shorthand
/// `ORDES/JEF` with it: where the first code carries a state prefix, a later
/// short code inherits it. Length-based rather than party-based, because only
/// the multi-state parties have codes long enough for the shorthand to be
/// unambiguous.
export function splitLocations(text: string | undefined): string[] {
  const codes = (text ?? '').split(SEPARATORS).map((code) => normalizeCode(code.trim())).filter((code) => code)
  if (codes.length > 1 && codes[0].length > 4) {
    const state = codes[0].slice(0, 2)
    return codes.map((code) => (code.length < 4 ? state + code : code))
  }
  return codes
}

/// Everything about the other station that a location depends on: the entity
/// they are in, which decides what a location we don't recognize resolves to.
export function entityPrefixOf(qso: Record<string, unknown> | undefined): string {
  const their = (qso?.their ?? {}) as Record<string, unknown>
  const guess = (their.guess ?? {}) as Record<string, unknown>
  // `||`, not `??`: the core writes an EMPTY STRING for a field that is present
  // and unanswered, and `??` would take that as an answer and never consult the
  // lookup's guess.
  const prefix = str(their.entityPrefix) || str(guess.entityPrefix)
  if (prefix) return prefix.toUpperCase()
  // Falls back to the country file. A QSO that came in through an ADIF import
  // or a sync carries no `guess` at all, and without this a DX station whose
  // exchange was never typed resolves to NOTHING — scored `missingExchange` at
  // zero, with no DX multiplier in the parties that count them, and an Alaskan
  // station never reaching `AK`.
  const call = str(their.call)
  return call ? entityPrefixForCall(call).toUpperCase() : ''
}

/// The state the other station is in, as looked up rather than sent — what the
/// suggestion line ranks by when the exchange has not been typed yet.
export function guessedStateOf(qso: Record<string, unknown> | undefined): string {
  const their = (qso?.their ?? {}) as Record<string, unknown>
  const guess = (their.guess ?? {}) as Record<string, unknown>
  // `||` for the reason `entityPrefixOf` gives: an empty `their.state` is the
  // absence of an answer, and taking it as one leaves the ranking with nothing
  // to rank by, silently.
  return (str(their.state) || str(guess.state)).trim().toUpperCase()
}

/// One code, resolved to what it is worth — or `''` when it is worth nothing,
/// which is how an unrecognizable exchange from a station in no known entity
/// stays out of the score.
///
/// Takes no `standing`: which side each end is on decides what a location
/// MULTIPLIES (`multCodeFor`), never what it resolves to — a county stays the
/// county that was sent, in the log, the checklist and the Cabrillo alike.
export function normalizeLocation(
  party: Party,
  code: string,
  { entityPrefix = '' }: { entityPrefix?: string } = {},
): string {
  let location = normalizeCode(code.trim())
  if (!location) return ''

  // A county is a county. Where a party does not count counties as in-party
  // multipliers it is the MULTIPLIER that becomes the state (`multCodeFor`);
  // the code stays what was sent, so the log, the county checklist and the
  // Cabrillo all still say which county it was.
  if (isInParty(party, location)) return location

  // A code we don't know that is long enough to be a county carries its state
  // in its first two characters — a neighbouring party's county, or a typo.
  if (location.length > 4) location = location.slice(0, 2)

  if (location === 'DC' || location === 'MD') {
    // BOTH map to `MD` where a party folds them together. Mapping `DC` to `MD`
    // and `MD` to `DC` swaps the two instead of merging them, and hands a party
    // that counts them as one two multipliers for what its rules call one.
    return party.dcCountsAsMaryland ? 'MD' : location
  }
  if (US_STATES[location]) {
    if (party.alaskaAndHawaiiAreDX && (location === 'AK' || location === 'HI')) return 'DX'
    return location
  }
  if (CANADIAN_PROVINCES[location]) return location

  // Nothing we recognize: fall back to where the callsign says they are. A
  // station with no entity at all resolves to nothing rather than to `DX` — an
  // unlookup-able callsign is a QSO we cannot place, not a DX contact.
  const state = STATE_ENTITIES[entityPrefix]
  if (state) return party.alaskaAndHawaiiAreDX ? 'DX' : state
  // A station in the party's OWN country sends a county or a state, so an
  // unrecognized value from one is a typo and resolves to nothing — which the
  // scorer reports as a bad exchange, with the QSO still in front of the
  // operator to fix. Answering `DX` here would score the contact and claim a
  // `DX:K` multiplier in every party that counts entities separately.
  if (entityPrefix === 'K' || entityPrefix === 'VE') return ''
  return entityPrefix ? 'DX' : ''
}

/// The multiplier key a resolved location contributes.
function multCodeFor(party: Party, code: string, entityPrefix: string, standing: QsoPartyStanding): string {
  // Inside the party, some sponsors multiply by STATE rather than by county.
  if (!party.countiesAreMultipliersInParty && standing.weAreInParty && standing.theyAreInParty
      && isInParty(party, code)) {
    // A county whose state nothing answers multiplies as ITSELF. The empty
    // string is one key: every stateless county in the party would collapse
    // into a single multiplier, and a party spanning three provinces would
    // score one where its sponsor awards three.
    return stateForCounty(party, code) || code
  }
  if (code === 'DX' && party.dxEntityIsMultiplier) return `DX:${entityPrefix}`
  return code
}

/// What to call a location out loud.
export function nameForLocation(party: Party, code: string, entityPrefix = ''): string {
  const location = normalizeCode(code)
  const county = party.counties[location] ?? party.otherCounties[location]
  if (county) return county
  if (location === 'DC') return party.dcCountsAsMaryland ? MARYLAND_AND_DC : DISTRICT_OF_COLUMBIA
  if (location === 'MD') return party.dcCountsAsMaryland ? MARYLAND_AND_DC : US_STATES.MD
  if (US_STATES[location]) return US_STATES[location]
  if (CANADIAN_PROVINCES[location]) return CANADIAN_PROVINCES[location]
  if (location === 'DX') return party.dxEntityIsMultiplier && entityPrefix ? `DX: ${entityPrefix}` : 'DX'
  return location
}

/// A whole exchange — one location, or a county line's two — resolved.
///
/// A party whose exchange is not a location at all answers for itself through
/// `resolveLocation`, and its answer is taken whole: it is what the scoreboard
/// counts AND what the submitted file writes, and the two disagreeing is the
/// failure this single seam exists to prevent.
export function parseLocations(
  party: Party,
  text: string | undefined,
  { entityPrefix = '', standing = UNDECIDED }: { entityPrefix?: string; standing?: QsoPartyStanding } = {},
): QsoPartyLocation[] {
  const answered = party.resolveLocation?.({ text: text ?? '', entityPrefix, standing })
  if (answered) return answered

  const seen = new Set<string>()
  const locations: QsoPartyLocation[] = []
  for (const raw of splitLocations(text)) {
    const code = normalizeLocation(party, raw, { entityPrefix })
    if (!code || seen.has(code)) continue
    seen.add(code)
    locations.push({
      code,
      multCode: multCodeFor(party, code, entityPrefix, standing),
      name: nameForLocation(party, code, entityPrefix),
      inParty: isInParty(party, code),
      // What a submitted file writes, which is not always what it scores as: a
      // party that logs a DX station by its entity prefix still scores it as
      // the single `DX` multiplier.
      sent: code === 'DX' && party.dxLocationIsPrefix && entityPrefix ? entityPrefix : code,
    })
  }
  return locations
}

/// What a station who sent us no exchange is recorded as — the ONE answer the
/// scorer and both exports read, so a contact cannot be scored under one
/// location and filed under another.
///
/// In the party's own country, what the lookup says: `their.state` if the
/// operator or an import asserted one, else the callsign lookup's guess. It is
/// consulted only here, where the alternative is `missingExchange` and a
/// contact worth nothing — the entry row still asks the operator for the
/// exchange, and still ranks counties rather than inventing one, because a
/// county is the thing a lookup cannot know.
///
/// The guess is refused unless it RESOLVES against this party, and consulted
/// only for a K or VE station: a DX lookup's `state` is its own country's
/// subdivision, and two-letter codes collide — a German `NS` is not Nova
/// Scotia. Outside those two countries the exchange is the entity, which no
/// party asks a DX station to type.
export function defaultTheirLocation(party: Party, qso: Record<string, JSONValue>): string {
  const entityPrefix = entityPrefixOf(qso as Record<string, unknown>)
  // A station in no known entity — no callsign yet, or one the country file
  // cannot place — is a QSO we cannot place, not a DX contact
  // (`normalizeLocation` draws the same line). Answering `DX` here would slip
  // past the scorer, which normalizes it back to nothing without an entity,
  // and be offered as the suggestion in an empty entry row.
  if (!entityPrefix) return ''
  if (entityPrefix === 'K' || entityPrefix === 'VE') {
    const guessed = guessedStateOf(qso as Record<string, unknown>)
    // A state CODE, and only that. `normalizeLocation` reads anything longer
    // than four characters as a county carrying its state in its first two, so
    // a lookup that hands back a NAME would resolve `MINNESOTA` to `MI` —
    // Michigan — and both the score and the file would claim the wrong state
    // with nothing looking wrong anywhere. Every US state, DC and every
    // Canadian province is two characters; a longer answer has told us nothing
    // we can file.
    if (guessed.length !== 2 || !normalizeLocation(party, guessed, { entityPrefix })) return ''
    return guessed
  }
  // Alaska and Hawaii are US STATES that do not send `K`, and the scorer
  // credits them as such — so a file that wrote `DX` for one would not support
  // the multiplier the scoreboard already claimed.
  const state = stateForEntity(entityPrefix)
  if (state && !party.alaskaAndHawaiiAreDX) return state
  return party.dxLocationIsPrefix && entityPrefix ? entityPrefix : 'DX'
}

/// The state an entity's stations are in, for the two that are US states but do
/// not send `K` — read by the export so its fallback cannot disagree with the
/// scorer about an Alaskan or Hawaiian contact.
export function stateForEntity(entityPrefix: string): string {
  return STATE_ENTITIES[entityPrefix] ?? ''
}

/// Whether every location given is inside the party — the test both sides'
/// standing is decided by. An empty list is NOT inside: a station whose
/// exchange we could not resolve is treated as out of the party, which is the
/// safe reading for the in-party-only rules that turn on this.
export function allInParty(locations: QsoPartyLocation[]): boolean {
  return locations.length > 0 && locations.every((location) => location.inParty)
}

/// Both sides' standing, resolved together: theirs depends on ours, and what
/// their county MULTIPLIES depends on both, so an exchange is resolved once to
/// learn their standing and again to price it.
export function theirLocations(
  party: Party,
  text: string | undefined,
  { entityPrefix, weAreInParty }: { entityPrefix: string; weAreInParty: boolean },
): { locations: QsoPartyLocation[]; standing: QsoPartyStanding } {
  const standing: QsoPartyStanding = { weAreInParty, theyAreInParty: false }
  let locations = parseLocations(party, text, { entityPrefix, standing })
  standing.theyAreInParty = allInParty(locations)
  // Cheap, and the only way the two ends agree: a party where an in-party pair
  // multiplies by state cannot know that from the first pass.
  if (standing.theyAreInParty) locations = parseLocations(party, text, { entityPrefix, standing })
  return { locations, standing }
}
