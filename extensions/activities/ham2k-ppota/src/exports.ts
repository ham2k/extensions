// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// ppota.app's uploader refuses an ADIF holding contacts from more than one UTC
// day ("Separe el log por fecha UTC"), and an activation is judged one UTC day
// at a time (rules §2.4). An evening activation in Argentina, at UTC-3, crosses
// 00:00 UTC as a matter of course, so one file per reference is not enough: an
// operation spanning several UTC days offers one file per reference AND day.
//
// `activityExportHook` does the work; this only multiplies its options by day
// and narrows the contacts handed to it. A single-day operation sees exactly
// what it would without the wrapper.

import { exportFilename, startMillisOf, utcDate } from "@ham2k/extension-sdk"
import type { ExportHook, ExportOption, HookContext, JSONValue } from "@ham2k/extension-sdk"

type Qso = Record<string, JSONValue>

const DAY_SUFFIX = /:(\d{4}-\d{2}-\d{2})$/

/// The contacts of each UTC day, days in order. A day is one at least one
/// live contact falls on; a deleted contact rides along with its day but makes
/// none of its own. A contact with no time at all — an import, a hand edit —
/// joins the first day rather than vanishing from every file.
function byUtcDay(qsos: Qso[]): Map<string, Qso[]> {
  const timed = new Map<string, Qso[]>()
  const timeless: Qso[] = []
  for (const qso of qsos) {
    const millis = Number(qso.startAtMillis ?? 0)
    if (!(millis > 0)) {
      timeless.push(qso)
      continue
    }
    const day = utcDate(millis)
    timed.set(day, [...(timed.get(day) ?? []), qso])
  }
  const days = [...timed.keys()].filter((day) => timed.get(day)!.some((q) => !q.deleted)).sort()
  return new Map(days.map((day, i) => [day, i === 0 ? [...timeless, ...timed.get(day)!] : timed.get(day)!]))
}

export function perUtcDay(inner: ExportHook): ExportHook {
  return {
    getExportTypes: inner.getExportTypes?.bind(inner),

    async suggestExportOptions(args, ctx: HookContext): Promise<ExportOption[]> {
      const options = (await inner.suggestExportOptions?.(args, ctx)) ?? []
      const days = byUtcDay(args.qsos ?? [])
      if (days.size <= 1) return options

      return options.flatMap((option) =>
        [...days].map(([day, qsos]) => ({
          ...option,
          exportKey: `${option.exportKey}:${day}`,
          label: `${option.label} (${day})`,
          // The day rides as the filename's modifier: a filename template is
          // dated by the whole log's first contact, and two files that
          // differed only in their contents would overwrite each other.
          templateData: { ...(option.templateData ?? {}), modifier: day },
          // The day's own count: the operator checking that a day reached
          // its five needs that day's number, not the whole log's.
          qsoCount: qsos.filter((q) => !q.deleted).length,
          filename: exportFilename({
            stationCall: String(args.operation.stationCall ?? ''),
            ref: String(option.templateData?.ref ?? ''),
            startAtMillis: startMillisOf(args.operation, qsos),
            extension: 'adi',
            compact: args.compactFilenames,
          }),
        })),
      )
    },

    async generateExport(args, ctx: HookContext) {
      const match = DAY_SUFFIX.exec(String(args.exportKey ?? ''))
      if (!match) return inner.generateExport(args, ctx)
      const day = match[1]
      return inner.generateExport(
        {
          ...args,
          exportKey: String(args.exportKey).slice(0, -match[0].length),
          qsos: byUtcDay(args.qsos ?? []).get(day) ?? [],
        },
        ctx,
      )
    },
  }
}
