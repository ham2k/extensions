// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The files a party's log leaves as: the sponsor's Cabrillo, and a contest ADIF
// that resolves every exchange the same way the Cabrillo does.
//
// The one place that cannot see segments is the EXPORT, which is handed the base
// operation and the whole log. So the county we were in is stamped onto each QSO
// as it is saved, and both files read that stamp in preference to the
// operation's own location — see `ourLocationForQso`.

import { adifForExport, exportFilename, startMillisOf } from "@ham2k/extension-sdk"
import type {
  AdifFieldsHook,
  ExportHook,
  ExportOption,
  ExportOptionsRequest,
  ExportRequest,
  ExportResult,
  HookContext,
  JSONValue,
} from "@ham2k/extension-sdk"

import { ourName, refOfType, str } from "./entry.ts"
import {
  cabrilloFor,
  hasSegments,
  ourLocationForQso,
  RESOLVED_MARKER,
  resolvedExchanges,
  SEGMENTED_MARKER,
  theirLocationForFile,
} from "./exchange.ts"
import { allInParty, parseLocations } from "./location.ts"
import type { QsoPartyParams } from "./params.ts"
import { type Party, resolveParty } from "./party.ts"

function filenameFor(
  party: Party,
  operation: Record<string, JSONValue>,
  qsos: Record<string, JSONValue>[],
  extension: string,
  compact?: boolean,
): string {
  return exportFilename({
    stationCall: operation.stationCall,
    activity: party.short,
    startAtMillis: startMillisOf(operation, qsos),
    extension,
    compact,
  })
}

export function qsoPartyAdifFields(params: QsoPartyParams): AdifFieldsHook {
  const party = resolveParty(params)

  return {
    async fieldsForOneQSO(
      { qso, operation }: { qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
      _ctx: HookContext,
    ): Promise<{ name: string; value: string }[]> {
      const qsoRef = refOfType(qso as Record<string, unknown>, party.refType)
      // This hook is asked one QSO at a time and never sees the log, so it cannot
      // tell a segmented operation from an unsegmented one — the Cabrillo can,
      // and does. Our OWN export tells it, so the two files agree; the core's
      // whole-log ADIF has no such marker and takes the stamp, which is right for
      // a rover and stale for a county corrected mid-log on an unsegmented one.
      const segmented = refOfType(operation as Record<string, unknown>, party.refType)?.[SEGMENTED_MARKER] !== false
      const ours = ourLocationForQso(party, qso, operation, { segmented })
      const weAreInParty = allInParty(parseLocations(party, ours))
      const ourSerial = str(qsoRef?.ourSerial)
      const theirSerial = str(qsoRef?.theirSerial)
      const theirName = str(qsoRef?.theirName)
      const ourOwnName = ourName(party, operation as Record<string, unknown>)

      // `CONTEST_ID` is the sponsor's published contest name — the same
      // vocabulary the Cabrillo's `CONTEST:` line uses, which is what ADIF's own
      // contest list is built from.
      const fields = [{ name: 'CONTEST_ID', value: party.cabrilloName ?? party.short }]

      // The exchange as SENT, in the order it was sent: serial, name, location.
      const sent = [ourSerial, ourOwnName, ours].filter((part) => part).join(' ')
      // Through the same resolution the Cabrillo takes, so the two files cannot
      // disagree about the same contact — a party that logs a DX station by its
      // prefix would otherwise write the prefix here and `DX` there. Our own
      // export also hands over what it resolved for the whole log, which is the
      // only way this hook can know what a station sent on an earlier band.
      const resolved = refOfType(operation as Record<string, unknown>, party.refType)?.[RESOLVED_MARKER] as
        | Record<string, string>
        | undefined
      const theirsForFile = resolved?.[str(qso.uuid)]
        ?? theirLocationForFile(party, qso, { weAreInParty })
      const received = [theirSerial, theirName, theirsForFile].filter((part) => part).join(' ')
      if (sent) fields.push({ name: 'STX_STRING', value: sent })
      if (received) fields.push({ name: 'SRX_STRING', value: received })
      if (ourSerial) fields.push({ name: 'STX', value: ourSerial })
      if (theirSerial) fields.push({ name: 'SRX', value: theirSerial })
      if (ourOwnName) fields.push({ name: 'MY_NAME', value: ourOwnName })
      if (theirName) fields.push({ name: 'NAME', value: theirName })

      return fields
    },
  }
}

export function qsoPartyExport(params: QsoPartyParams): ExportHook {
  const party = resolveParty(params)

  return {
    async suggestExportOptions(args: ExportOptionsRequest, _ctx: HookContext): Promise<ExportOption[]> {
      if (!refOfType(args.operation as Record<string, unknown>, party.refType)) return []
      const named = (extension: string) =>
        filenameFor(party, args.operation, args.qsos ?? [], extension, args.compactFilenames)

      const options: ExportOption[] = [{
        exportType: 'contest-adif',
        format: 'adif',
        label: `ADIF for ${party.short}`,
        filename: named('adi'),
        selectedByDefault: true,
        refType: party.refType,
      }]

      // A party that names no contest cannot produce a submittable Cabrillo: the
      // `CONTEST:` line is what tells a checker which contest the file is for,
      // and inventing one produces a file that looks submittable and is not.
      if (party.cabrilloName) {
        options.push({
          exportType: 'cabrillo',
          format: 'cabrillo',
          label: `Cabrillo for ${party.short}`,
          filename: named('log'),
          selectedByDefault: true,
          refType: party.refType,
        })
      }

      return options
    },

    async generateExport(args: ExportRequest, _ctx: HookContext): Promise<ExportResult> {
      // Only the two exportTypes offered above: a hook answering for an
      // exportType it never offered makes the ADIF delegation recurse.
      if (args.exportType !== 'cabrillo' && args.exportType !== 'contest-adif') {
        return { filename: '', mimeType: '', content: '' }
      }

      const operation = args.operation
      const segmented = hasSegments(args.qsos)

      if (args.exportType === 'cabrillo') {
        return {
          filename: filenameFor(party, operation, args.qsos, 'log', args.compactFilenames),
          mimeType: 'text/plain',
          content: cabrilloFor(party, operation, args.qsos, { segmented }),
        }
      }

      const content = await adifForExport({
        // Marked so `adifFields` reads the county the same way the Cabrillo does
        // — see SEGMENTED_MARKER. A copy, never the stored operation.
        operation: {
          ...operation,
          refs: ((operation.refs as Record<string, JSONValue>[] | undefined) ?? []).map((r) =>
            r?.type === party.refType
              ? {
                ...r,
                [SEGMENTED_MARKER]: segmented,
                [RESOLVED_MARKER]: resolvedExchanges(party, operation, args.qsos, { segmented }),
              }
              : r),
        },
        qsos: args.qsos,
        includePrivateData: args.includePrivateData,
        // This file is the CONTEST's log, so the core exporter asks this
        // extension's `adifFields` hook and no other's.
        mainHandler: party.refType,
      })
      return {
        filename: filenameFor(party, operation, args.qsos, 'adi', args.compactFilenames),
        mimeType: 'text/plain',
        content,
      }
    },
  }
}
