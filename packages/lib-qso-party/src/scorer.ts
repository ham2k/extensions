// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// QSO-party scoring: one scorer for every party, built from that party's
// params.
//
// Three things make it unlike an ordinary contest:
//
//   1. **Our own location is part of the score, and it moves.** A rover's county
//      comes from the segment-effective ref, so `scoreQso` reads it per QSO —
//      changing it rescores the log under the new county, and the per-county
//      bonus a rover drives for is awarded against wherever they were at the
//      time rather than wherever they finished.
//   2. **County lines multiply both ways.** A station on a county line sends two
//      counties, and either end may be on one, so a single contact can be worth
//      up to four QSOs and four multipliers.
//   3. **In-party and out-of-party score by different rules**, and which side we
//      are on is not a setting — it is whether the county we typed is one of the
//      party's own.
//
// What a duplicate is: a contact repeats if the same callsign, band, mode, OUR
// county and THEIR county has been logged before — and a pair that overlaps a
// previous contact on any ONE of its combinations counts as a repeat, not just
// one that overlaps on all of them. That costs a rover on a county line a QSO
// the sponsor might well allow, and the other reading claims contacts a log
// checker may strike; an over-claim in a submitted file is the worse error.

import type { ContestScorer, JSONValue, QsoScoreVerdict, ScoreTally } from "@ham2k/extension-sdk"

import { isMobile, ourLocationText, partyRefIn, powerMultiplier, str } from "./entry.ts"
import type { QsoPartyLocation, QsoPartyParams } from "./params.ts"
import { allInParty, entityPrefixOf, parseLocations, theirLocations } from "./location.ts"
import { CANADIAN_PROVINCES, US_STATES } from "./locations.ts"
import { superModeForMode } from "./modes.ts"
import {
  isInParty,
  normalizeCode,
  type Party,
  partyStates,
  pointsForMode,
  resolveParty,
  scoringModeFor,
  stateForCounty,
  WARC_BANDS,
} from "./party.ts"
import type { QsoPartyScoresheet } from "./index.ts"

/// Thousands separators for the figures an operator reads mid-contest. Local
/// rather than `fmtInteger` from `@ham2k/lib-format-tools`, which is one of the
/// host's libraries: this package is bundled INTO an extension, and a bundle
/// that reaches for a host library it was not given fails at load rather than
/// at the line that formats a number.
function fmtInteger(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/// The prefix that makes a multiplier key per-band, per-mode, both or neither.
///
/// The two side-specific options widen the per-band rule for the side they name,
/// and nothing else changes: a party that counts the in-party side per band must
/// still reach the plain per-band and per-mode rules for the other side.
export function multiplierPrefix(
  party: Party,
  { band, mode, weAreInParty }: { band: string; mode: string; weAreInParty: boolean },
): string {
  const answered = party.multiplierKeyPrefix?.({ band, mode, weAreInParty })
  if (answered !== undefined) return answered

  const perBand = party.multsPerBand
    || (party.inStateMultsPerBand && weAreInParty)
    || (party.outOfStateMultsPerBand && !weAreInParty)
  const perMode = party.multsPerMode
  if (party.multsPerBandMode || (perBand && perMode)) return `${band}:${mode}:`
  if (perBand) return `${band}:`
  if (perMode) return `${mode}:`
  return ''
}

/// The prefix a bonus station's key carries — the same idea for bonuses, which
/// a few parties pay once per band and mode, or once per mode.
function bonusPrefix(party: Party, band: string, mode: string): string {
  if (party.bonusPerBandMode) return `${band}:${mode}:`
  if (party.bonusPerMode) return `${mode}:`
  return ''
}

/// What a bonus station pays US. A party may scale it by which side we are on:
/// an in-party factor of 0 is how a party says its bonus stations pay
/// out-of-party entrants only.
function bonusValue(party: Party, call: string, weAreInParty: boolean): number {
  const answered = party.bonusForStation?.({ call, weAreInParty })
  if (answered !== undefined) return answered

  const base = party.bonusStations[call]
  if (base === undefined) return 0
  return base * (weAreInParty ? party.bonusStationInStateMult : party.bonusStationOutOfStateMult)
}

/// The callsign a bonus station is recognized by — the base call, so a rover's
/// `K4TCG/M` still pays. Through the same spelling the party's own list was
/// normalized to, so a hand-written slashed zero on either side is the digit it
/// stands for.
function baseCallOf(qso: Record<string, JSONValue>): string {
  const their = (qso.their as Record<string, JSONValue>) ?? {}
  const guess = (their.guess as Record<string, JSONValue>) ?? {}
  return normalizeCode(str(their.baseCall) || str(guess.baseCall) || str(their.call))
}

/// The DX entity a location stands for — its prefix where each entity multiplies
/// separately, the single key `DX` where they share one.
function entityOf(location: QsoPartyLocation): string {
  return location.multCode.startsWith('DX:') ? location.multCode.slice(3) : 'DX'
}

/// The multiplier keys one of their locations contributes, and the tables it
/// belongs in. Split out because `stateCountsForInState` means a single county
/// can be two multipliers at once — the county, and the state it is in.
function multipliersFor(
  party: Party,
  location: QsoPartyLocation,
  { prefix, weAreInParty, entityCount, worked }: {
    prefix: string
    weAreInParty: boolean
    entityCount: number
    /// Whether this location's entity has already been CREDITED in this log.
    worked: boolean
  },
): { keys: string[]; county?: string; state?: string; province?: string; entity?: string } {
  const code = location.code

  if (isInParty(party, code)) {
    const keys = [`${prefix}${location.multCode}`]
    let claimedState: string | undefined
    // Where the county multiplies as its STATE, that state is what was claimed,
    // and the summary's states table has to say so — otherwise an entrant works
    // a county, scores its state, and reads a checklist still showing that state
    // as needed.
    if (location.multCode !== code) claimedState = location.multCode
    // An in-party station's own state is a multiplier too, on top of the county
    // it came from — but only where the state is a real state or province, so a
    // multi-state party's made-up prefix never becomes one.
    if (party.stateCountsForInState && weAreInParty) {
      const state = stateForCounty(party, code)
      if (US_STATES[state] || CANADIAN_PROVINCES[state]) {
        const key = `${prefix}${state}`
        if (!keys.includes(key)) keys.push(key)
        claimedState ??= state
      }
    }
    const isProvince = claimedState !== undefined && CANADIAN_PROVINCES[claimedState] !== undefined
    return {
      keys,
      county: code,
      state: isProvince ? undefined : claimedState,
      province: isProvince ? claimedState : undefined,
    }
  }

  if (US_STATES[code] || code === 'DC') return { keys: [`${prefix}${code}`], state: code }
  if (CANADIAN_PROVINCES[code]) return { keys: [`${prefix}${code}`], province: code }

  if (code === 'DX') {
    const entity = entityOf(location)
    if (!party.dxIsMultiplier && !party.dxEntityIsMultiplier) {
      // A valid contact worth points, and no multiplier — most parties.
      return { keys: [], entity }
    }
    const max = party.dxEntityMultiplierMax
    // The cap counts entities already claimed — and one we have credited before
    // is always still claimable, or a party at its limit would stop crediting an
    // entity it has already credited. Testing what was WORKED instead lets a
    // second contact with an over-cap entity through, one multiplier past a
    // published cap.
    if (max !== undefined && entityCount >= max && !worked) return { keys: [], entity }
    return { keys: [`${prefix}${location.multCode}`], entity }
  }

  return { keys: [] }
}

/// A location for a station that sent none — their entity, where the party asks
/// for one, and nothing at all for a station in the party's own country, who is
/// expected to send a state or a county.
function defaultLocationFor(party: Party, entityPrefix: string): string {
  if (!entityPrefix || entityPrefix === 'K' || entityPrefix === 'VE') return ''
  return party.dxLocationIsPrefix ? entityPrefix : 'DX'
}

export function qsoPartyScorer(params: QsoPartyParams): ContestScorer<QsoPartyScoresheet> {
  const party = resolveParty(params)

  return {
    startScoresheet(): QsoPartyScoresheet {
      return {
        mults: {}, counties: {}, states: {}, provinces: {}, entities: {}, creditedEntities: {},
        rareCounties: {}, bonuses: {}, bonusStations: {}, activatedCounties: {},
        worked: {}, lastLocation: {}, bands: {}, modes: {},
        qsos: 0, points: 0, dupes: 0,
      }
    },

    // Mutates and returns the given scoresheet — see ContestScorer.scoreQso.
    // `isNewDay` is deliberately not read: a party is one period, and nothing
    // in its score resets at midnight (see `summarizeScore`).
    scoreQso({ scoresheet: sheet, qso, operation, ref }) {
      const their = (qso.their as Record<string, JSONValue>) ?? {}
      const call = str(their.call).toUpperCase()
      if (!call) return { scoresheet: sheet, score: { value: 0 } }

      const band = str(qso.band)
      if (!band || WARC_BANDS.includes(band)) {
        return { scoresheet: sheet, score: { value: 0, alerts: ['invalidBand'] } }
      }

      // A QSO with no mode keeps the per-QSO default rather than being judged:
      // `superModeForMode('')` answers `DATA`, which would price an import that
      // lost its MODE column as a digital contact.
      const rawMode = str(qso.mode)
      const superMode = rawMode ? superModeForMode(rawMode) : ''
      const mode = scoringModeFor(party, superMode)

      // OUR side, from the segment-effective ref: this is what a rover changes.
      const ourLocations = parseLocations(
        party,
        ourLocationText(party, operation as Record<string, unknown>, ref as Record<string, unknown>),
      )
      if (ourLocations.length === 0) {
        // Nothing can be scored until the operator says where they are — every
        // QSO is worth our counties × theirs, and ours is zero.
        return { scoresheet: sheet, score: { value: 0, alerts: ['ourLocation'] } }
      }
      const weAreInParty = allInParty(ourLocations)
      // An operator inside the party who typed their STATE where their county
      // belongs. It resolves cleanly, so nothing else objects, and the whole log
      // is then scored under out-of-party rules: different multiplier keys, no
      // own-county multiplier, no activated-county bonus. The contact still
      // counts for what it is worth; the operator is told, on every QSO.
      const ourStates = weAreInParty ? undefined : partyStates(party)
      const typedOurState = ourStates !== undefined
        && ourLocations.some((location) => ourStates.has(location.code))
      sheet.weAreInParty ??= weAreInParty
      // The first DECLARED multiplier wins, not the first QSO's answer: `??=`
      // would latch the 1 that stands for "no class declared".
      if (!sheet.powerMult || sheet.powerMult === 1) {
        sheet.powerMult = powerMultiplier(party, operation as Record<string, unknown>, ref as Record<string, unknown>)
      }
      if (isMobile(party, operation as Record<string, unknown>, ref as Record<string, unknown>)) sheet.mobile = true

      // THEIR side. An exchange left blank falls back to what this station sent
      // us earlier, then to what their callsign says — a DX station's exchange
      // is its entity, and no party asks them to type it.
      const entityPrefix = entityPrefixOf(qso)
      const qsoRef = partyRefIn(party, qso as Record<string, unknown>)
      const typed = str(qsoRef?.location).trim()
      const fallback = sheet.lastLocation[call] ?? defaultLocationFor(party, entityPrefix)
      const { locations: theirs, standing } = theirLocations(party, typed || fallback, {
        entityPrefix,
        weAreInParty,
      })
      const theyAreInParty = standing.theyAreInParty

      if (theirs.length === 0) {
        return {
          scoresheet: sheet,
          score: { value: 0, alerts: [typed ? 'invalidExchange' : 'missingExchange'] },
        }
      }

      // The party is between its own people and everyone else: two out-of-party
      // stations working each other is not a contest QSO at all.
      if (!weAreInParty && !theyAreInParty) {
        return { scoresheet: sheet, score: { value: 0, alerts: ['invalidExchange'] } }
      }

      // Every pairing of our counties with theirs is its own contact — the N×M a
      // county line earns.
      const priced = party.pointsForContact?.({
        qso, band, superMode, ours: ourLocations, theirs, weAreInParty, theyAreInParty,
      })
      const perContact = priced ?? (
        !theyAreInParty && party.pointsWhenTheyAreOutOfParty !== undefined
          ? party.pointsWhenTheyAreOutOfParty
          : pointsForMode(party, superMode)
      )
      let value = perContact * ourLocations.length * theirs.length
      if (party.inStateToOutOfStatePointsDouble && weAreInParty && !theyAreInParty) value *= 2

      const notices: string[] = []
      const rareCounties: string[] = []
      for (const location of theirs) {
        const rare = party.rareCountyMultipliers[location.code]
        if (rare) {
          rareCounties.push(location.code)
          value *= rare
        }
      }
      if (rareCounties.length > 0) notices.push('rareCounty')

      // Duplicates, against the pairs already credited. A slot is one band, one
      // mode and one of OUR counties, so a rover who drives into the next county
      // may work the same station again.
      const bySlot = (sheet.worked[call] ??= {})
      const slots = Object.keys(bySlot)
      const workedBefore = slots.length > 0
      const pairs: { slot: string; code: string }[] = []
      for (const ours of ourLocations) {
        for (const theirLocation of theirs) {
          pairs.push({ slot: `${band}|${mode}|${ours.code}`, code: theirLocation.code })
        }
      }
      const repeat = pairs.some(({ slot, code }) => (bySlot[slot] ?? []).includes(code))

      sheet.lastLocation[call] = theirs.map((location) => location.code).join('/')

      if (repeat) {
        sheet.dupes += 1
        return { scoresheet: sheet, score: { value: 0, dupe: true, alerts: ['duplicate'] } }
      }

      if (workedBefore) {
        if (!slots.some((slot) => slot.startsWith(`${band}|`))) notices.push('newBand')
        if (!slots.some((slot) => slot.split('|')[1] === mode)) notices.push('newMode')
      }

      const prefix = multiplierPrefix(party, { band, mode, weAreInParty })

      // Our own county can be a multiplier without working anyone in it, for the
      // parties that say so. Claimed on every QSO rather than once, so that a
      // party counting multipliers per band claims it on each band we operate.
      const selfCounts = party.selfCountsForCounty
        || (party.selfMobileCountsForCounty
          && isMobile(party, operation as Record<string, unknown>, ref as Record<string, unknown>))
      if (selfCounts) {
        for (const ours of ourLocations) {
          if (!ours.inParty) continue
          // Our own county joins the counties table as well as the multiplier
          // set, so the checklist shows it struck: that list is a chase list, and
          // a county we are sitting in and already claiming needs no chasing.
          sheet.counties[ours.code] ??= 0
          sheet.mults[`${prefix}${ours.code}`] ??= 0
          sheet.mults[`${prefix}${ours.code}`] += 1
        }
      }

      let newMult = false
      for (const location of theirs) {
        const { keys, county, state, province, entity } = multipliersFor(party, location, {
          prefix,
          weAreInParty,
          entityCount: Object.keys(sheet.creditedEntities).length,
          worked: sheet.creditedEntities[entityOf(location)] !== undefined,
        })
        for (const key of keys) {
          if (sheet.mults[key] === undefined) {
            newMult = true
            sheet.mults[key] = 0
          }
          sheet.mults[key] += 1
        }
        if (county !== undefined) sheet.counties[county] = (sheet.counties[county] ?? 0) + 1
        if (state !== undefined) sheet.states[state] = (sheet.states[state] ?? 0) + 1
        if (province !== undefined) sheet.provinces[province] = (sheet.provinces[province] ?? 0) + 1
        if (entity !== undefined) {
          sheet.entities[entity] = (sheet.entities[entity] ?? 0) + 1
          // Credited only when this location actually produced a multiplier key.
          if (keys.length > 0) sheet.creditedEntities[entity] = (sheet.creditedEntities[entity] ?? 0) + 1
        }
      }
      if (newMult) notices.push('newMult')

      // A bonus station pays once per bonus slot; later contacts with it are
      // ordinary QSOs.
      const baseCall = baseCallOf(qso)
      const bonus = bonusValue(party, baseCall, weAreInParty)
      if (bonus > 0) {
        const key = `${bonusPrefix(party, band, mode)}${baseCall}`
        if (sheet.bonuses[key] === undefined) {
          sheet.bonuses[key] = bonus
          sheet.bonusStations[baseCall] = (sheet.bonusStations[baseCall] ?? 0) + bonus
          notices.push('bonusStation')
        }
      }

      for (const { slot, code } of pairs) (bySlot[slot] ??= []).push(code)
      for (const county of rareCounties) sheet.rareCounties[county] = (sheet.rareCounties[county] ?? 0) + 1
      for (const ours of ourLocations) {
        if (ours.inParty) sheet.activatedCounties[ours.code] = (sheet.activatedCounties[ours.code] ?? 0) + 1
      }
      sheet.bands[band] = (sheet.bands[band] ?? 0) + 1
      if (mode) sheet.modes[mode] = (sheet.modes[mode] ?? 0) + 1
      sheet.qsos += 1
      sheet.points += value

      const score: QsoScoreVerdict = { value, band }
      if (notices.length > 0) score.notices = notices
      if (typedOurState) score.alerts = ['ourLocation']
      return { scoresheet: sheet, score }
    },

    summarizeScore({ scoresheet: sheet, scope }): Record<string, ScoreTally> {
      // A QSO party is ONE period, however many UTC days it straddles — the
      // sponsors publish one total, and the multipliers and bonuses are won
      // across the whole log. A "day's score" against the running multiplier
      // is a figure nobody recognizes, so the day sections and the log's day
      // headers get nothing from this scorer.
      if (scope === 'day') return {}

      const mult = Object.keys(sheet.mults).length || 1
      const points = sheet.points
      const bonusPoints = oneTimeBonuses(party, sheet)
      const power = sheet.powerMult ?? 1

      // A party that adds its bonus after the multiplier says so; the rest fold
      // it in before.
      const total = Math.round(party.bonusPostMultiplier
        ? points * mult * power + bonusPoints
        : (points + bonusPoints) * mult * power)

      return {
        [party.refType]: {
          key: party.refType,
          for: scope,
          // The default for a QSO party, for an extension whose manifest names
          // none. Each event's own manifest is where a distinct icon goes.
          icon: party.icon ?? 'star-box',
          total,
          points,
          mults: mult,
          qsos: sheet.qsos,
          // The label is the section's TITLE in the information panel, and the
          // short `summary` is not shown beside a tally that has a
          // `longSummary` — so the event's name and its total go here, and the
          // arithmetic behind the total opens the detail.
          label: `${party.short}: ${fmtInteger(total)}`,
          summary: `${fmtInteger(total)}`,
          longSummary: [
            arithmeticFor({ points, mult, bonusPoints, power }),
            longSummaryFor(party, sheet, bonusPoints),
          ].join('\n\n'),
          grid: true,
        },
      }
    },
  }
}

/// The bonuses that are won once for the whole log rather than per QSO: the
/// stations, the sweeps, and the counties a rover activated.
function oneTimeBonuses(party: Party, sheet: QsoPartyScoresheet): number {
  let total = Object.values(sheet.bonuses).reduce((sum, points) => sum + points, 0)

  if (party.bonus.rareCountySweep > 0) {
    const needed = party.bonus.rareCountySweepMinimumCount
      || Object.keys(party.rareCountyMultipliers).length
    if (needed > 0 && Object.keys(sheet.rareCounties).length >= needed) {
      total += party.bonus.rareCountySweep
    }
  }

  if (party.bonus.bonusStationSweep > 0) {
    const needed = party.bonus.bonusStationSweepMinimumCount
      || Object.keys(party.bonusStations).length
    if (needed > 0 && Object.keys(sheet.bonusStations).length >= needed) {
      total += party.bonus.bonusStationSweep
    }
  }

  // A party that pays per activated county pays it to rovers only unless it says
  // otherwise, so an entry that never declared itself mobile claims none of them
  // — a fixed station operating from its own county would otherwise collect the
  // bonus a rover drove all day for.
  if (party.bonus.perActivatedCounty > 0 && (!party.bonus.perActivatedCountyRoverOnly || sheet.mobile)) {
    total += activatedCounties(party, sheet).length * party.bonus.perActivatedCounty
  }

  return total
}

/// The counties that count as activated: ours, with enough contacts from each.
function activatedCounties(party: Party, sheet: QsoPartyScoresheet): string[] {
  const minimum = party.bonus.perActivatedCountyMinimumCount || 1
  return Object.entries(sheet.activatedCounties)
    .filter(([, qsos]) => qsos >= minimum)
    .map(([county]) => county)
}

/// How the total came about — `points × mults`, the bonus, the power factor.
function arithmeticFor(
  { points, mult, bonusPoints, power }: { points: number; mult: number; bonusPoints: number; power: number },
): string {
  const parts = [`${fmtInteger(points)} × ${fmtInteger(mult)}`]
  if (bonusPoints > 0) parts.push(`+ ${fmtInteger(bonusPoints)}`)
  // Only shown when it is doing something: most parties have no power table at
  // all, and an entrant who declared no class multiplies by 1.
  if (power !== 1) parts.push(`× ${power}`)
  return parts.join(' ')
}

/// The tables an operator reads while operating: which counties are still out
/// there, which states and provinces are missing, and which bonus stations are
/// unworked. `**~~STRUCK~~**` is the core's own checklist convention
/// (`grid: true`).
function longSummaryFor(party: Party, sheet: QsoPartyScoresheet, bonusPoints: number): string {
  const parts: string[] = []
  const worked = (table: Record<string, number>, code: string) =>
    table[code] !== undefined ? `**~~${code}~~**` : code

  const activated = activatedCounties(party, sheet)
  if (activated.length > 0 && party.bonus.perActivatedCounty > 0
      && (!party.bonus.perActivatedCountyRoverOnly || sheet.mobile)) {
    parts.push(`**Activated:** ${activated.map((county) => `${county} (${fmtInteger(sheet.activatedCounties[county])})`).join(' • ')}`)
  }

  const countyCodes = Object.keys(party.counties)
  const countiesWorked = countyCodes.filter((code) => sheet.counties[code] !== undefined).length
  parts.push(`### ${fmtInteger(countiesWorked)} of ${fmtInteger(countyCodes.length)} ${party.short} ${party.labelForCounties}`)
  parts.push(countyCodes.map((code) => worked(sheet.counties, code)).join(' '))

  if (Object.keys(party.rareCountyMultipliers).length > 0) {
    const rare = Object.keys(party.rareCountyMultipliers).sort()
    const swept = party.bonus.rareCountySweep > 0
      && Object.keys(sheet.rareCounties).length >= (party.bonus.rareCountySweepMinimumCount || rare.length)
    parts.push(`### ${fmtInteger(Object.keys(sheet.rareCounties).length)} Rare ${party.labelForCounties}${swept ? ` • **Sweep! +${fmtInteger(party.bonus.rareCountySweep)}**` : ''}`)
    parts.push(rare.map((code) => worked(sheet.rareCounties, code)).join(' '))
  }

  // The states-and-provinces sweep belongs to the party's own entrants: an
  // out-of-party station's multipliers are its counties, and printing fifty
  // states they can never claim reads as fifty missing ones.
  if (sheet.weAreInParty) {
    parts.push(`### ${fmtInteger(Object.keys(sheet.states).length)} US States`)
    const states = Object.keys(US_STATES)
    if (!party.dcCountsAsMaryland) states.push('DC')
    parts.push(states.map((code) => worked(sheet.states, code)).join(' '))

    parts.push(`### ${fmtInteger(Object.keys(sheet.provinces).length)} Canadian Provinces`)
    parts.push(Object.keys(CANADIAN_PROVINCES).map((code) => worked(sheet.provinces, code)).join(' '))

    if (party.dxEntityIsMultiplier || party.dxIsMultiplier) {
      const entities = Object.keys(sheet.entities).sort()
      const max = party.dxEntityMultiplierMax
      // Against the cap, the count has to be the CREDITED one: an entrant who
      // works twelve entities under a cap of ten is credited ten, and "12 of 10"
      // is the one number on this line that cannot be right.
      const claimed = max ? Object.keys(sheet.creditedEntities).length : entities.length
      parts.push(`### ${fmtInteger(claimed)}${max ? ` of ${fmtInteger(max)}` : ''} DX ${party.dxEntityIsMultiplier ? 'Entities' : 'Multiplier'}`)
      if (entities.length > 0) parts.push(entities.map((code) => `**~~${code}~~**`).join(' '))
    }
  }

  const bonusCalls = Object.keys(party.bonusStations)
  if (bonusCalls.length > 0) {
    parts.push(`### ${fmtInteger(Object.keys(sheet.bonusStations).length)} of ${fmtInteger(bonusCalls.length)} Bonus Stations${bonusPoints > 0 ? ` • ${fmtInteger(bonusPoints)} pts` : ''}`)
    parts.push(bonusCalls.map((code) => worked(sheet.bonusStations, code)).join(' '))
  }

  const bands = Object.keys(sheet.bands).sort()
  if (bands.length > 0) {
    parts.push(bands.map((band) => `**${band}**: ${fmtInteger(sheet.bands[band])} QSOs`).join('\n'))
  }
  if (sheet.dupes > 0) parts.push(`${fmtInteger(sheet.dupes)} duplicate${sheet.dupes === 1 ? '' : 's'}`)

  return parts.join('\n\n')
}
