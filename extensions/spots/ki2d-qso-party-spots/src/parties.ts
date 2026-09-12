// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Which parties the calendar says to read. The party extensions each know
// their own party and nothing else; this source has to know all fifty,
// because `fetchSpots` is handed no operation — `@ham2k/qso-parties/identities`
// is that list, generated from the same fixtures the party extensions are.

import { PARTY_IDENTITIES } from "@ham2k/qso-parties/identities"
import type { QsoPartyIdentity } from "@ham2k/qso-parties/identity"

/// How long before a period opens its feeds are read, and how long after it
/// closes. Before, so that a station setting up on Saturday morning sees who
/// is already on the road; after, because the feeds keep the last hour's
/// spots and a log is still being finished. Outside this window no party is
/// fetched at all — fifty parties polled every two minutes all year would be
/// a hundred requests a cycle for nothing.
export const OPENS_BEFORE_MILLIS = 6 * 60 * 60 * 1000
export const CLOSES_AFTER_MILLIS = 2 * 60 * 60 * 1000

/// The parties whose feeds are worth reading at [now].
export function activeParties(now: number, parties: QsoPartyIdentity[] = PARTY_IDENTITIES): QsoPartyIdentity[] {
  return parties.filter((party) =>
    party.periods.some((p) => p.startMillis - OPENS_BEFORE_MILLIS <= now && now <= p.endMillis + CLOSES_AFTER_MILLIS),
  )
}
