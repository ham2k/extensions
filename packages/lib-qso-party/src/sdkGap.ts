// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What the published `@ham2k/extension-sdk` (0.2.0) does not export yet —
// copied from the SDK source, to be deleted when the SDK next publishes (see
// the repository README, "The SDK gap").

import type { ExportRequest, ExportResult, JSONValue, OperationSegmentPayload } from "@ham2k/extension-sdk"

/// `ExportRequest` as the SDK source now declares it: with the resolved
/// segments the host sends on a segmented log. The published type lacks the
/// field; the host sends it regardless.
export type SegmentedExportRequest = ExportRequest & { segments?: OperationSegmentPayload[] }

/// Copy of the SDK's `segments.ts` `operationForQso`: the segment-effective
/// operation for [qso] — the last segment that had begun by the contact's
/// `startAtMillis`, or [base] on an unsegmented log (or for a contact with no
/// time, which the scoring fold also reads as the epoch). A QSO at exactly a
/// segment's `fromMillis` belongs to that segment, as on the host.
export function operationForQso(
  base: Record<string, JSONValue>,
  qso: Record<string, JSONValue>,
  segments?: OperationSegmentPayload[],
): Record<string, JSONValue> {
  if (!segments || segments.length === 0) return base
  const at = typeof qso.startAtMillis === 'number' ? qso.startAtMillis : 0
  let effective = base
  for (const segment of segments) {
    if (segment.fromMillis > at) break
    effective = segment.operation
  }
  return effective
}

/// Copy of the SDK's `adifForExport`, with `segments` forwarded as
/// `ExportRequest.segments` — the published one drops it, and a delegating
/// export that drops it exports a rover's whole log under one county.
export async function adifForExport(
  { operation, qsos, segments, includePrivateData, mainHandler, includeFieldsFrom }: {
    operation: Record<string, JSONValue>
    qsos: Record<string, JSONValue>[]
    segments?: OperationSegmentPayload[]
    includePrivateData?: boolean
    mainHandler: string
    includeFieldsFrom?: string[]
  },
): Promise<string> {
  const { hooks } = await import("@ham2k/extension-sdk")
  const entries = await hooks.invokeOne('export', 'adif', 'generateExport', {
    operation,
    qsos,
    segments,
    exportType: 'adif',
    includePrivateData,
    mainHandler,
    includeFieldsFrom,
  })
  const content = (entries.find((e) => e.ok)?.value as ExportResult | undefined)?.content
  if (!content) {
    const failed = entries.find((e) => !e.ok)?.error
    throw new Error(`${mainHandler}: the ADIF exporter produced no file${failed ? ` (${failed})` : ''}`)
  }
  return content
}
