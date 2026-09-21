// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The exchange as the operator sees it and as the sponsor receives it: which
// codes the entry row offers, which of them are floated to the top, and the
// Cabrillo rows one contact turns into.

import { operationForQso } from "@ham2k/extension-sdk"
import type { JSONValue, OperationSegmentPayload } from "@ham2k/extension-sdk"
import { qsonToCabrillo } from "@ham2k/lib-qson-cabrillo"

import {
  ourEmail,
  ourLocationText,
  ourModeClass,
  ourName,
  ourOperatorClass,
  ourOverlayClass,
  ourPowerClass,
  ourStationClass,
  partyRefIn,
  str,
} from "./entry.ts"
import {
  allInParty,
  COUNTY_LINE_SEPARATOR,
  defaultTheirLocation,
  entityPrefixOf,
  nameForLocation,
  parseLocations,
  splitLocations,
  theirLocations,
} from "./location.ts"
import { CANADIAN_PROVINCES, US_STATES } from "./locations.ts"
import { normalizeCode, type Party, partyStates, stateForCounty, WARC_BANDS } from "./party.ts"

/// What a contact with no exchange typed is recorded as, resolved the way the
/// scorer resolves it: what this station sent us earlier, then what their
/// callsign says.
export function theirLocationForFile(
  party: Party,
  qso: Record<string, JSONValue>,
  { weAreInParty, lastLocation }: { weAreInParty: boolean; lastLocation?: Record<string, string> },
): string {
  const qsoRef = partyRefIn(party, qso as Record<string, unknown>)
  const entityPrefix = entityPrefixOf(qso as Record<string, unknown>)
  const their = (qso.their as Record<string, JSONValue>) ?? {}
  const call = str(their.call).toUpperCase()
  const remembered = call ? lastLocation?.[call] : undefined
  const text = str(qsoRef?.location).trim() || remembered || defaultTheirLocation(party, qso)
  const { locations } = theirLocations(party, text, { entityPrefix, weAreInParty })
  if (call && locations.length > 0 && lastLocation) {
    lastLocation[call] = locations.map((location) => location.code).join(COUNTY_LINE_SEPARATOR)
  }
  return locations.map((location) => location.sent).join(COUNTY_LINE_SEPARATOR)
}

/// Whether a contact on [band] counts at all — the WARC bands are closed to
/// contests by IARU convention, and a QSO with no band cannot be checked against
/// any sponsor's rules. The scorer's own test, kept here so the file and the
/// scoreboard cannot disagree about which contacts exist.
export function claimableBand(band: string): boolean {
  return band !== '' && !WARC_BANDS.includes(band)
}

/// The key our own ADIF export sets on the operation's ref: each contact's
/// resolved exchange, by QSO uuid.
///
/// `adifFields` is asked one contact at a time and never sees the log, so it
/// cannot know what a station sent EARLIER — and the scorer and the Cabrillo
/// both score a blank exchange under the county that station gave the first
/// time. Without this the same export run writes the county in the Cabrillo and
/// nothing at all in the ADIF, for a contact the scoreboard counted.
///
/// Carried on a copy of the operation — of EVERY segment's operation, since the
/// core generator hands the hook the segment-effective one.
export const RESOLVED_MARKER = 'resolvedExchange'

/// Every contact's exchange as the file should write it, by uuid — folded in
/// log order, so a station's later blank exchange resolves to what they sent
/// before, exactly as the scorer folds it.
export function resolvedExchanges(
  party: Party,
  operation: Record<string, JSONValue>,
  qsos: Record<string, JSONValue>[],
  segments?: OperationSegmentPayload[],
): Record<string, string> {
  const lastLocation: Record<string, string> = {}
  const resolved: Record<string, string> = {}
  for (const qso of qsos) {
    if (qso.band === 'event' || qso.deleted === true) continue
    const uuid = str(qso.uuid)
    const ours = parseLocations(party, ourLocationForQso(party, qso, operation, segments))
    const text = theirLocationForFile(party, qso, {
      weAreInParty: allInParty(ours),
      // A contact the scorer refuses teaches it nothing, so it may not teach
      // this fold either.
      lastLocation: claimableBand(str(qso.band)) ? lastLocation : undefined,
    })
    if (uuid) resolved[uuid] = text
  }
  return resolved
}

/// The county WE were in for this contact: the operation's own location, read
/// off the operation that was true when the contact was made.
///
/// A rover's county changes mid-log through segments, and the host hands the
/// export the same resolved segments the scorer folds — so the file and the
/// scoreboard read one answer. Nothing is stamped onto the contact and nothing
/// on it is preferred: a county corrected in setup, or in a segment, reaches
/// every contact of that stretch the moment it is corrected, in the score and
/// in the file alike. Without segments the operation's location is true of the
/// whole log by definition.
export function ourLocationForQso(
  party: Party,
  qso: Record<string, JSONValue>,
  operation: Record<string, JSONValue>,
  segments?: OperationSegmentPayload[],
): string {
  return ourLocationText(party, operationForQso(operation, qso, segments) as Record<string, unknown>)
}

/// One contact's Cabrillo rows — one per pairing of our counties with theirs,
/// which is how a county line is submitted: each end scores every combination,
/// so each combination is a line the checker can match against the other
/// station's log.
export function cabrilloRowsFor(
  party: Party,
  qso: Record<string, JSONValue>,
  operation: Record<string, JSONValue>,
  ourCall: string,
  { segments, lastLocation }: { segments?: OperationSegmentPayload[]; lastLocation?: Record<string, string> } = {},
): string[][] {
  const qsoRef = partyRefIn(party, qso as Record<string, unknown>)
  const their = (qso.their as Record<string, JSONValue>) ?? {}
  const call = str(their.call).toUpperCase()
  const theirCall = cabrilloCall(party, str(their.call))
  const entityPrefix = entityPrefixOf(qso as Record<string, unknown>)

  // Resolved through the SAME path the scorer takes, rather than read raw off
  // the ref. Two ways the two drift apart, in opposite directions: a station
  // whose exchange was typed once and left blank on the next band scores under
  // the county they gave the first time, and a file reading the ref raw claims
  // FEWER contacts than the scoreboard; an unrecognizable exchange from a US
  // station scores zero, and a file reading the ref raw claims MORE.
  const typed = str(qsoRef?.location).trim()
  const remembered = call ? lastLocation?.[call] : undefined
  const theirText = typed || remembered || defaultTheirLocation(party, qso)

  const ourLocations = parseLocations(party, ourLocationForQso(party, qso, operation, segments))
  const weAreIn = allInParty(ourLocations)
  const { locations, standing } = theirLocations(party, theirText, { entityPrefix, weAreInParty: weAreIn })

  // Every gate the scorer applies, in the order it applies them — a contact it
  // scored zero may not appear in the file, and one it never learned from may
  // not teach the file either.
  if (!claimableBand(str(qso.band))) return []
  if (!weAreIn && !standing.theyAreInParty) return []

  // Only now is this a contact the file claims, so only now is it something the
  // next blank exchange may resolve from.
  if (call && locations.length > 0 && lastLocation) {
    // Remembered as the CODE, which is what the next contact resolves from — a
    // prefix written into the file is not something to re-parse.
    lastLocation[call] = locations.map((location) => location.code).join(COUNTY_LINE_SEPARATOR)
  }

  const isCw = str(qso.mode) === 'CW' || str(qso.mode) === 'RTTY'
  const report = isCw ? '599' : '59'
  const ourSerial = str(qsoRef?.ourSerial)
  const theirSerial = str(qsoRef?.theirSerial)
  const ourOwnName = ourName(party, operation as Record<string, unknown>)
  const theirName = str(qsoRef?.theirName).toUpperCase()

  const rows: string[][] = []
  for (const ourCode of ourLocations.map((location) => location.sent)) {
    for (const theirCode of locations.map((location) => location.sent)) {
      const row = [(ourCall || '-').padEnd(13, ' '), report.padEnd(3, ' ')]
      if (party.exchange.number) row.push((ourSerial || '0').padEnd(6, ' '))
      if (party.exchange.name) row.push((ourOwnName || '-').padEnd(10, ' '))
      row.push(ourCode.padEnd(6, ' '))
      row.push((theirCall || '-').padEnd(13, ' '), report.padEnd(3, ' '))
      if (party.exchange.number) row.push((theirSerial || '-').padEnd(6, ' '))
      if (party.exchange.name) row.push((theirName || '-').padEnd(10, ' '))
      row.push(theirCode.padEnd(6, ' '))
      rows.push(row)
    }
  }
  return rows
}

/// The callsign as the sponsor wants it in the file. A suffix is only ever
/// removed where the party asked for it.
export function cabrilloCall(party: Party, call: string): string {
  const upper = call.toUpperCase()
  if (!party.removeCountySuffixes) return upper
  const slash = upper.indexOf('/')
  return slash > 0 ? upper.slice(0, slash) : upper
}

/// The codes the exchange field offers, for the station being worked.
///
/// Narrowed by who they are: a US station in a US party may send a county, a
/// state, or one of a neighbouring party's counties; a Canadian station in that
/// same party can only send a province; and a station in neither country sends
/// their entity, which is not a list at all.
export function exchangeOptionsFor(
  party: Party,
  qso: Record<string, JSONValue> | undefined,
): { code: string; name?: string }[] {
  const entity = qso ? entityPrefixOf(qso as Record<string, unknown>) : ''
  const asOptions = (table: Record<string, string>) =>
    Object.entries(table).map(([code, name]) => ({ code, name }))

  const ourCounties = [...asOptions(party.counties), ...asOptions(party.otherCounties)]
  // `US_STATES` holds the fifty states and not DC, because whether DC is its own
  // multiplier is a per-party rule. It is still a value stations SEND, on every
  // party, so it belongs in the list either way — without it the field tints a
  // perfectly good exchange as unknown while the scorer accepts it.
  // The party's OWN states are not in either list. Nobody sends one: inside the
  // party the exchange is a county, and outside it nobody is in those states to
  // begin with — so `NY` in the New York QSO Party is an exchange no station
  // could have given, and the field says so in red rather than accepting it as
  // the state it resolves to. (`partyStates` is the same set the scorer reads
  // to catch an operator who typed their state where their county belongs;
  // this is the other end of that mistake.)
  const ours = partyStates(party)
  const notOurs = (options: { code: string; name?: string }[]) =>
    options.filter((option) => !ours.has(option.code))
  const states = notOurs([
    ...asOptions(US_STATES),
    { code: 'DC', name: nameForLocation(party, 'DC') },
  ])
  const provinces = notOurs(asOptions(CANADIAN_PROVINCES))

  if (entity === 'K') {
    return party.entity === 'VE' ? states : [...ourCounties, ...states]
  }
  if (entity === 'VE') {
    return party.entity === 'VE' ? [...ourCounties, ...provinces] : provinces
  }
  // A known entity that is neither: they send `DX` or their prefix, and there is
  // no list to search. An empty set turns the field freeform.
  if (entity) return []
  // Nobody looked up yet — offer everything, since the operator may be typing
  // the exchange before the callsign resolves.
  return [...ourCounties, ...states, ...provinces]
}

/// The Cabrillo `CATEGORY-` lines the declared entry classes produce.
///
/// This is the reason the classes are captured at all: a submitted log declares
/// its entry in these lines, and a checker reads them rather than guessing.
/// Nothing is emitted for a question the operator did not answer — an omitted
/// line is "no claim", while a guessed one is a claim they never made.
///
/// `operator` splits back into the two lines Cabrillo keeps apart: the
/// multi-operator classes are one `CATEGORY-OPERATOR` with the transmitter
/// count beside it.
export function cabrilloCategories(
  party: Party,
  operation: Record<string, JSONValue>,
): [string, string | undefined][] {
  const op = ourOperatorClass(party, operation as Record<string, unknown>)
  const station = ourStationClass(party, operation as Record<string, unknown>)
  const mode = ourModeClass(party, operation as Record<string, unknown>)
  const overlay = ourOverlayClass(party, operation as Record<string, unknown>)
  const power = ourPowerClass(party, operation as Record<string, unknown>)

  const transmitter = op === 'MULTI-ONE'
    ? 'ONE'
    : op === 'MULTI-TWO'
      ? 'TWO'
      : op === 'MULTI-UNLIMITED'
        ? 'UNLIMITED'
        : undefined

  return [
    ['CATEGORY-OPERATOR', op ? (op.startsWith('SINGLE') ? 'SINGLE-OP' : 'MULTI-OP') : undefined],
    ['CATEGORY-TRANSMITTER', transmitter],
    // Only ever ASSISTED: Cabrillo's other value is NON-ASSISTED, and claiming
    // that for an operator who simply answered "Single Op" would be a claim
    // about their spotting that they did not make.
    ['CATEGORY-ASSISTED', op === 'SINGLE-OP-ASSISTED' ? 'ASSISTED' : undefined],
    ['CATEGORY-POWER', power],
    // `COUNTY-LINE` is a station class sponsors publish and Cabrillo has no
    // value for; it reaches the file as the closest thing it does have.
    ['CATEGORY-STATION', station === 'COUNTY-LINE' ? 'FIXED' : station],
    ['CATEGORY-MODE', mode === 'PHONE' ? 'SSB' : mode === 'DIGITAL' ? 'DIGI' : mode],
    ['CATEGORY-OVERLAY', overlay],
  ]
}

/// The live rewrites the exchange field applies as the operator types: one, and
/// only for a party that has county lines — a comma becomes the separator the
/// operator meant.
export function exchangeTransforms(party: Party): { pattern: string; replacement: string; flags?: string }[] {
  if (!party.countyLine) return []
  return [{ pattern: ',', replacement: COUNTY_LINE_SEPARATOR, flags: 'g' }]
}

/// How many characters a second county may borrow from the first — the
/// multi-state shorthand, where `ORDES/JEF` means `ORDES/ORJEF`.
///
/// Declared rather than rewritten. A rewrite cannot tell the shorthand from the
/// same letters being typed on the way to the full code: after `IDADA/`, `IDA`
/// is either Idaho county's shorthand or the first three characters of `IDIDA`,
/// and real counties have exactly that shape. The field matches and validates
/// both readings and rewrites neither.
export function exchangeInheritPrefix(party: Party): number {
  // Only the multi-state parties have codes long enough for the shorthand to
  // mean anything — the same length test `splitLocations` makes.
  return Object.keys(party.counties).some((code) => code.length > 4) ? 2 : 0
}

/// The exchange pre-filled from the callsign lookup: the state it guessed.
///
/// Outside the party the state IS the whole exchange, and a lookup is right
/// about which state a US call lives in nearly every time — so filling it saves
/// the operator the one thing they would otherwise type for most of the log.
///
/// This is the one place a guess is written into the field rather than ranked
/// into the suggestion line (`preferredCodesFor`). The argument for ranking is
/// about a COUNTY guess, which no lookup makes; a state is a narrower claim and
/// a far better one. The core still guarantees a suggestion never displaces
/// what the operator typed.
///
/// Filled only when it is one of the codes this station could send, which is
/// the whole guard: [options] holds no DX list at all, and no party holds its
/// OWN states, so an in-party caller — who sends a county — is refused here by
/// the same rule that tints `NY` red in the New York QSO Party.
///
/// [options] is what `exchangeOptionsFor` already answered for this station —
/// passed in rather than rebuilt, because it runs once per callsign resolution
/// and is up to ~470 entries for the largest parties.
export function suggestedExchangeFor(
  party: Party,
  options: { code: string }[],
  guessedState: string,
): string | undefined {
  if (!guessedState) return undefined
  return options.some((option) => option.code === guessedState) ? guessedState : undefined
}

/// What this station sent us EARLIER in this operation, if anything.
///
/// The best answer there is: it is not a guess at all but an exchange the
/// operator already copied from this same station, and it is what the scorer
/// and both exports fall back to for a blank second-band contact (the
/// `lastLocation` fold). Offering it in the field means the operator confirms
/// it rather than discovering after the fact that it was assumed.
///
/// [qsos] is the operation's log, oldest first, so the LAST match wins — a
/// rover who gave a new county on the last band sent that county, not the one
/// they opened with.
export function loggedExchangeFor(
  party: Party,
  qsos: Record<string, JSONValue>[],
  call: string,
): string {
  const wanted = call.trim().toUpperCase()
  if (!wanted) return ''
  let found = ''
  for (const qso of qsos) {
    if (qso.band === 'event') continue
    const their = (qso.their as Record<string, JSONValue>) ?? {}
    if (str(their.call).toUpperCase() !== wanted) continue
    const location = str(partyRefIn(party, qso as Record<string, unknown>)?.location).trim()
    if (location) found = location
  }
  return found
}

/// The codes floated to the top of the suggestion list: the counties of the
/// state the callsign lookup guessed, and the state itself.
export function preferredCodesFor(party: Party, guessedState: string): string[] {
  if (!guessedState) return []
  const state = normalizeCode(guessedState)
  const counties = Object.keys(party.counties).filter((code) => stateForCounty(party, code) === state)
  // The state itself only where it is a code a station could send: inside the
  // party it is not offered at all (`exchangeOptionsFor`), and floating a value
  // to the top of a list it is not in would offer the operator an exchange the
  // same field then tints as wrong.
  return partyStates(party).has(state) ? counties : [...counties, state]
}

/// Our own location as the file's `LOCATION:` header writes it — the county, or
/// a county line's two, in the canonical separator.
export function ourLocationForFile(party: Party, operation: Record<string, JSONValue>): string {
  return splitLocations(ourLocationText(party, operation as Record<string, unknown>)).join(COUNTY_LINE_SEPARATOR)
}

/// The whole submittable Cabrillo.
///
/// Here rather than in the export hook so that the file a sponsor receives can
/// be tested: it is submitted once, months after the contest, and nobody reads
/// it before it goes.
export function cabrilloFor(
  party: Party,
  operation: Record<string, JSONValue>,
  qsos: Record<string, JSONValue>[],
  segments?: OperationSegmentPayload[],
): string {
  // The same memory the scorer folds: a station worked again on another band
  // without retyping the exchange is scored under the county they gave the first
  // time, so the file has to say the same.
  const lastLocation: Record<string, string> = {}
  const ourCall = str(operation.stationCall)
  return qsonToCabrillo(qsos, {
    headers: [
      ['CONTEST', party.cabrilloName],
      ['CALLSIGN', ourCall],
      ['LOCATION', ourLocationForFile(party, operation)],
      ...cabrilloCategories(party, operation),
      ['EMAIL', ourEmail(party, operation as Record<string, unknown>)],
      ['OPERATORS', str((operation.local as Record<string, JSONValue>)?.operatorCall)],
      ['GRID-LOCATOR', str(operation.grid)],
    ],
    qsoParts: (qso) => cabrilloRowsFor(
      party,
      qso as Record<string, JSONValue>,
      operation,
      ourCall,
      { segments, lastLocation },
    ),
  })
}
