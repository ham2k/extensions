// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// services.ham2k.net's callsign records as lookup answers, for the two ways
// an extension reaches them: `ham2k-lookup` asks the service for one call at
// a time, and the offline extensions keep one of its sets on the device and
// read it from there (`./offline.ts`, its own entry point so that
// `ham2k-lookup`'s bundle carries none of its code; the translations, shared
// by both, include the offline sets' few strings). Both read the same record,
// so they answer alike.

import { createCachedTranslator } from "@ham2k/extension-sdk"
import { cleanLocationParams } from "@ham2k/lib-geo-tools"
import type { AnnotatedCallInfo, CallInfoLookup } from "@ham2k/extension-sdk"

import en from "./i18n/en.json" with { type: "json" }
import es from "./i18n/es.json" with { type: "json" }

export const tFor = createCachedTranslator({ en: { translation: en }, es: { translation: es } })

/// The service's ISO-3166 alpha-2 codes as the full names CallInfo.country
/// carries (QRZ and HamDB both report full names).
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  DE: "Germany",
  NO: "Norway",
}

/// The service's class names, per country, as "<regulator key>:<level code>"
/// pairs from @ham2k/lib-operation-data's LICENSE_LEVELS. "Basic + Morse"
/// stands for both Morse qualifications, 5 and 12 wpm, which open the same
/// bands; B+5 is the level lib-operation-data has for them. Norway's records
/// carry no class.
export const LICENSE_LEVELS: Record<string, Record<string, string>> = {
  US: { Novice: "us:N", Technician: "us:T", General: "us:G", Advanced: "us:A", Extra: "us:E" },
  CA: { Basic: "ca:B", "Basic with Honours": "ca:B/H", "Basic + Morse": "ca:B+5", Advanced: "ca:B+A" },
  DE: { "Class N": "de:N", "Class E": "de:E", "Class A": "de:A" },
}

export type Ham2kCallLookup = CallInfoLookup & { online?: boolean; licenseLevel?: string }

/// One of the service's call records as a lookup answer about [call].
export function callRecordLookup(
  record: Record<string, unknown>,
  { call, source, locationScope }: { call: string; source: string; locationScope: CallInfoLookup["locationScope"] },
): Ham2kCallLookup {
  const real = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined)

  const city = real(record.city)
  const state = real(record.state)
  const countryCode = real(record.country)
  const [lat, lon] = cleanLocationParams(real(record.lat), real(record.lon))
  return {
    call: real(record.call) ?? call,
    source,
    scope: "general",
    locationScope,
    name: real(record.name),
    location: [city, state].filter(Boolean).join(", "),
    city,
    state,
    county: real(record.county),
    country: countryCode ? (COUNTRY_NAMES[countryCode] ?? countryCode) : undefined,
    grid: real(record.grid),
    lat,
    lon,
    licenseLevel: countryCode ? LICENSE_LEVELS[countryCode]?.[real(record.class) ?? ""] : undefined,
  }
}

/// The record for a call, or null when the source has none.
export type CallRecordSource = (call: string) => Promise<Record<string, unknown> | null>

/// FCC license statuses for a license no longer in force: cancelled, expired
/// and terminated. Not the pending ones, "L" (pending legal status) and "X"
/// (termination pending), whose license may still be valid.
const INACTIVE_STATUSES = new Set(["C", "E", "T"])

/// Whether [record] is for a license no longer in force. Only FCC records
/// say (see INACTIVE_STATUSES). ISED, BNetzA and NKOM publish only current
/// licenses, which the service marks "A", and a record with no status at
/// all (the offline sets' compact ones) says nothing either way.
export function isInactiveRecord(record: Record<string, unknown>): boolean {
  return typeof record.status === "string" && INACTIVE_STATUSES.has(record.status)
}

/// The call the holder of an inactive license uses now, from [holderRecords]
/// (every record the service has under the same FCC registration number, as
/// `/lookups/us-fcc-frn/<frn>` lists them): their active amateur license
/// other than [call], the most recently granted when there are several. A
/// GMRS license shares the registration number but is no amateur call.
export function currentCallAmong(holderRecords: unknown, call: string): string | undefined {
  if (!Array.isArray(holderRecords)) return undefined
  // FCC dates are MM/DD/YYYY, which sort only once turned around.
  const sortable = (date: unknown) => (typeof date === "string" ? date.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, "$3$1$2") : "")
  const active = holderRecords.filter(
    (r): r is Record<string, unknown> =>
      !!r && typeof r === "object" && r.status === "A" && (r.service == null || r.service === "amateur") && typeof r.call === "string" && r.call.toUpperCase() !== call.toUpperCase(),
  )
  active.sort((a, b) => sortable(b.granted).localeCompare(sortable(a.granted)))
  return active[0]?.call as string | undefined
}

/// How [lookupCallRecord] marks an inactive license beside the name: [t]
/// translates the mark, and [currentCall], when given, finds the call the
/// holder uses now. A failure to find one leaves the plain "(Inactive)": an
/// error [currentCall] throws is not reported, so it logs its own.
export type LicenseStatusOptions = {
  t: (key: string, options?: any) => string
  currentCall?: (record: Record<string, unknown>) => Promise<string | undefined>
}

/// The answer about [callInfo] from [records]: the call as given first, then
/// its base call. The service knows only plain registered calls, so a
/// "KI2D/P" is usually answered by "KI2D", and that answer is the operator's
/// home QTH whatever the call's own scope says.
///
/// With [status], the name of a license no longer in force reads
/// "Name (Inactive)", or "Name (Currently KI2D)" when the holder's current
/// call can be found. The mark rides in the name because a lookup answer has
/// no field for a license's standing.
export async function lookupCallRecord(
  callInfo: AnnotatedCallInfo,
  records: CallRecordSource,
  source: string,
  status?: LicenseStatusOptions,
): Promise<Ham2kCallLookup | null> {
  const call = (callInfo.call || "").trim().toUpperCase()
  if (call.length < 3) return null

  let record = await records(call)
  let locationScope: CallInfoLookup["locationScope"] = callInfo.locationScope ?? "qth"
  if (!record && callInfo.baseCall && callInfo.baseCall.toUpperCase() !== call) {
    record = await records(callInfo.baseCall.toUpperCase())
    locationScope = "qth"
  }
  if (!record) return null

  const answer = callRecordLookup(record, { call, source, locationScope })
  if (status && answer.name && isInactiveRecord(record)) {
    let currentCall: string | undefined
    try {
      currentCall = await status.currentCall?.(record)
    } catch {
      currentCall = undefined
    }
    answer.name = `${answer.name} ${currentCall ? status.t("currently", { call: currentCall }) : status.t("inactive")}`
  }
  return answer
}
