// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The files a log leaves as, and the hooks an extension registers.
//
// These are the only modules that reach for the SDK's RUNTIME — `contestScorer`,
// `adifForExport`, the export filenames — and the SDK's published bundle imports
// its own modules without a file extension, which node's ESM resolver refuses.
// So the SDK is stubbed here through node's module hooks, and everything under
// test is imported dynamically afterwards: a static import would be evaluated
// before the hook is registered, and the file would fail to load rather than
// fail an assertion.
//
// What is stubbed is only the seam. The Cabrillo below is the real writer's
// output, and the fields are the ones a checker reads.

import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

import type { ExportRequest, HookContext } from "@ham2k/extension-sdk"

// The real SDK, with the host boundary swapped: `hooks.invokeOne` is what
// reaches the core's ADIF generator, and here it echoes what it was handed
// back as the file — the per-QSO resolution is the generator's job and is
// tested with it. Everything else, `adifForExport` included, is the SDK's own,
// so a delegating export that dropped `segments` would fail HERE and not only
// on the host. The file NAME is fixed too: the SDK's reads the operation's
// date, and the clock when it has none, and neither is what these tests are
// about. A local name shadows the same name from `export *`.
const SDK_STUB = `
export * from "sdk:real"
export function exportFilename({ activity, extension }) { return activity + '.' + extension }
export function startMillisOf() { return 0 }
export const hooks = {
  async invokeOne(hook, key, method, { operation, segments, mainHandler, includePrivateData, includeLookupData, exportSettings, exportData, exportTitle }) {
    return [{ ok: true, key, value: { content: JSON.stringify({ mainHandler, refs: operation.refs, segments, includePrivateData, includeLookupData, exportSettings, exportData, exportTitle }) } }]
  },
}
`

registerHooks({
  resolve(specifier, context, next) {
    // Resolved from this file, not from the stub: `stub:sdk` is no place to
    // look a bare specifier up from.
    if (specifier === 'sdk:real') return next('@ham2k/extension-sdk', { ...context, parentURL: import.meta.url })
    if (specifier === '@ham2k/extension-sdk') return { url: 'stub:sdk', shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'stub:sdk') return { format: 'module', source: SDK_STUB, shortCircuit: true }
    return next(url, context)
  },
})

const { defineQsoParty } = await import("./index.ts")
const { RESOLVED_MARKER } = await import("./exchange.ts")
const { CA, NY, WI } = await import("./testFixtures.ts")

const ctx = {} as never

const operation = (params = NY, location = 'ALB') => ({
  uuid: 'op',
  stationCall: 'N0DEV',
  refs: [{ type: params.refType, location }],
})

const contact = (location: string, params = NY, extra: Record<string, unknown> = {}) => ({
  uuid: 'q1',
  their: { call: 'K1ABC', entityPrefix: 'K' },
  band: '20m',
  mode: 'CW',
  startAtMillis: Date.UTC(2026, 9, 17, 14, 30),
  refs: [{ type: params.refType, location }],
  ...extra,
})

test('one party registers one of each hook, scoped to its own ref type', () => {
  const hooks = defineQsoParty(NY)
  assert.deepEqual(Object.keys(hooks).sort(), [
    'activity', 'adifFields', 'export', 'refHandler', 'refType', 'scoring',
  ])
  assert.equal(hooks.refType, NY.refType)
  // Scoped, so this scorer is asked about its own party's operations and no
  // others.
  assert.deepEqual((hooks.scoring as { scope?: unknown }).scope, { refTypes: [NY.refType] })
})

test('a Cabrillo is offered only by a party that names the contest', async () => {
  const withName = await defineQsoParty(NY).export.suggestExportOptions!(
    { operation: operation(), qsos: [] },
    ctx,
  )
  assert.deepEqual(withName.map((option) => option.exportType), [`${NY.refType}-adif`, `${NY.refType}-cabrillo`])
  assert.deepEqual(withName.map((option) => option.filename), ['NYQP.adi', 'NYQP.log'])

  // Without a `CONTEST:` line there is nothing to tell a checker which contest
  // the file is for, and inventing one produces a file that looks submittable
  // and is not.
  const unnamed = await defineQsoParty(WI).export.suggestExportOptions!(
    { operation: operation(WI, 'ADAM'), qsos: [] },
    ctx,
  )
  assert.deepEqual(unnamed.map((option) => option.exportType), [`${WI.refType}-adif`])

  // And nothing at all is offered for an operation that is not running this
  // party.
  assert.deepEqual(
    await defineQsoParty(NY).export.suggestExportOptions!({ operation: { uuid: 'op', refs: [] }, qsos: [] }, ctx),
    [],
  )
})

test('the export sheet names the two files in the party′s own words', async () => {
  // The labels an operator picks between are the ENGINE's words, not the
  // sponsor's, so they take the same translator seam the setup form does. The
  // short name is part of the label rather than appended to it, because where a
  // name belongs in a sentence is the translator's business and not this
  // module's.
  const es = { locale: 'es' } as never
  const translated = {
    ...NY,
    labels: {
      adifExport: (hookCtx: HookContext) => (hookCtx.locale === 'es' ? 'ADIF del NYQP' : 'ADIF for NYQP'),
      cabrilloExport: (hookCtx: HookContext) => (
        hookCtx.locale === 'es' ? 'Cabrillo del NYQP' : 'Cabrillo for NYQP'
      ),
    },
  }
  const spanish = await defineQsoParty(translated).export.suggestExportOptions!(
    { operation: operation(translated), qsos: [] },
    es,
  )
  assert.deepEqual(spanish.map((option) => option.label), ['ADIF del NYQP', 'Cabrillo del NYQP'])

  // A party that names neither reads as English in any locale: the seam costs
  // an event nothing until it uses it.
  const plain = await defineQsoParty(NY).export.suggestExportOptions!(
    { operation: operation(), qsos: [] },
    es,
  )
  assert.deepEqual(plain.map((option) => option.label), ['ADIF for NYQP', 'Cabrillo for NYQP'])
})

test('the Cabrillo is the sponsor′s file, headers and all', async () => {
  const result = await defineQsoParty(CA).export.generateExport({
    exportType: `${CA.refType}-cabrillo`,
    operation: {
      ...operation(CA, 'ALAM'),
      refs: [{ type: CA.refType, location: 'ALAM', operator: 'SINGLE-OP', power: 'LOW' }],
    },
    qsos: [contact('BUTT', CA, {
      refs: [{ type: CA.refType, location: 'BUTT', ourSerial: '1', theirSerial: '7' }],
    })],
  }, ctx)

  assert.equal(result.filename, 'CQP.log')
  const lines = result.content.split('\n')
  assert.ok(lines.includes('CONTEST: CA-QSO-PARTY'))
  assert.ok(lines.includes('CATEGORY-OPERATOR: SINGLE-OP'))
  assert.match(lines.find((line) => line.startsWith('QSO:'))!, /1\s+ALAM\s+K1ABC\s+599\s+7\s+BUTT/)
})

test('an exportType this hook never offered is refused', async () => {
  // A hook that answers for the plain ADIF makes the core's delegation recurse
  // into itself.
  const result = await defineQsoParty(NY).export.generateExport(
    { exportType: 'adif', operation: operation(), qsos: [contact('ERI')] },
    ctx,
  )
  assert.deepEqual(result, { filename: '', mimeType: '', content: '' })
})

test('the ADIF export tells the per-QSO hook what the Cabrillo already knows', async () => {
  // `adifFields` is asked one contact at a time and never sees the log, so it
  // cannot know what a station sent on an earlier band. The answer rides on a
  // COPY of the operation — and of every segment's, since the core generator
  // hands the hook the segment-effective one — along with the segments
  // themselves, forwarded so the generator can resolve it.
  const segments = [
    { fromMillis: -1, operation: operation() },
    { fromMillis: 1000, operation: operation(NY, 'REN') },
  ]
  const result = await defineQsoParty(NY).export.generateExport({
    exportType: `${NY.refType}-adif`,
    operation: operation(),
    segments,
    qsos: [contact('ERI'), { ...contact(''), uuid: 'q2', band: '40m' }],
  } as ExportRequest, ctx)

  const handed = JSON.parse(result.content) as {
    mainHandler: string
    refs: Record<string, unknown>[]
    segments: { fromMillis: number; operation: { refs: Record<string, unknown>[] } }[]
  }
  assert.equal(handed.mainHandler, NY.refType, 'this file is the contest′s log')
  // The second contact typed no exchange and is resolved to what that station
  // sent the first time — the same fold the scorer and the Cabrillo make.
  assert.deepEqual(handed.refs[0][RESOLVED_MARKER], { q1: 'ERI', q2: 'ERI' })
  assert.equal(handed.segments.length, 2)
  assert.equal(handed.segments[1].operation.refs[0].location, 'REN')
  assert.deepEqual(handed.segments[1].operation.refs[0][RESOLVED_MARKER], { q1: 'ERI', q2: 'ERI' })
})

test('one contact′s ADIF fields are the exchange as it was sent and received', async () => {
  const fields = await defineQsoParty(CA).adifFields.fieldsForOneQSO({
    qso: contact('BUTT', CA, {
      refs: [{ type: CA.refType, location: 'BUTT', ourSerial: '1', theirSerial: '7' }],
    }),
    operation: operation(CA, 'ALAM'),
  }, ctx)

  assert.deepEqual(fields, [
    { name: 'CONTEST_ID', value: 'CA-QSO-PARTY' },
    { name: 'STX_STRING', value: '1 ALAM' },
    { name: 'SRX_STRING', value: '7 BUTT' },
    { name: 'STX', value: '1' },
    { name: 'SRX', value: '7' },
  ])
})


test('party registrations keep settings separate and reflect available formats', async () => {
  const ny = await defineQsoParty(NY).export.getExportTypes!({}, ctx)
  const ca = await defineQsoParty(CA).export.getExportTypes!({}, ctx)
  const wi = await defineQsoParty(WI).export.getExportTypes!({}, ctx)
  assert.deepEqual(ny.map((type) => type.exportType), [`${NY.refType}-adif`, `${NY.refType}-cabrillo`])
  assert.equal(ca[0].exportType, `${CA.refType}-adif`)
  assert.notEqual(ny[0].exportType, ca[0].exportType)
  assert.deepEqual(wi.map((type) => type.format), ['adif'])
})

test('ADIF delegation preserves explicit privacy and template preferences', async () => {
  const exportSettings = { customTemplates: true, adifNotesTemplate: '', adifCommentTemplate: 'My comment' }
  const exportData = { activity: 'NYQP' }
  const result = await defineQsoParty(NY).export.generateExport({
    exportType: `${NY.refType}-adif`, operation: operation(), qsos: [contact('ERI')],
    includePrivateData: false, includeLookupData: false, exportSettings, exportData, exportTitle: 'My party log',
  }, ctx)
  const handed = JSON.parse(result.content)
  assert.equal(handed.includePrivateData, false)
  assert.equal(handed.includeLookupData, false)
  assert.deepEqual(handed.exportSettings, exportSettings)
  assert.deepEqual(handed.exportData, exportData)
  assert.equal(handed.exportTitle, 'My party log')
})
