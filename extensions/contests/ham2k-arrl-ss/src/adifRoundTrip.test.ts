// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Exercise the registered hooks together: the contest's standard ADIF fields
// become the lowercase record fields the host hands to importers, then the
// restored refs must score and export like the original log. This is a hook
// integration test, not a running app or the core ADIF parser.

import assert from "node:assert/strict"
import { test } from "node:test"

import type { AdifImportResult, ExportResult, JSONValue, ScoreQsosResult } from "@ham2k/extension-sdk"

import { fixtureOperation, loadExtension } from "./sdkGapTesting.ts"

const contest = await loadExtension(() => import("./index.ts"))

const paths = ['complete', 'individual fields', 'exchange strings'] as const

for (const mode of ['CW', 'SSB'] as const) {
  for (const path of paths) {
    test(`${mode}: exported ${path} restore exchange refs, scoring and Cabrillo`, async () => {
      // The host does not infer contest setup from ADIF records. Configure the
      // imported operation explicitly, as an operator does before scoring it.
      const operation = fixtureOperation({
        uuid: `round-trip-${mode}-${path}`,
        stationCall: 'N0DEV',
        refs: [{ type: 'arrl-ss', mode, entry: 'SO-LOW', check: '00', section: 'CT' }],
      })
      const qsos: Record<string, JSONValue>[] = [
        {
          uuid: 'q1',
          their: { call: 'VE3ABC' },
          band: '20m',
          mode: mode === 'SSB' ? 'USB' : 'CW',
          freq: mode === 'SSB' ? 14250 : 14035,
          startAtMillis: Date.UTC(2026, 10, mode === 'SSB' ? 21 : 7, 21),
          refs: [{ type: 'arrl-ss', ourSerial: 21, theirSerial: '007', theirPrecedence: 'U', theirCheck: '00', theirSection: 'GH' }],
        },
        {
          uuid: 'q2',
          their: { call: 'VY1AAA' },
          band: '40m',
          mode: mode === 'SSB' ? 'LSB' : 'CW',
          freq: mode === 'SSB' ? 7180 : 7035,
          startAtMillis: Date.UTC(2026, 10, mode === 'SSB' ? 21 : 7, 21, 2),
          refs: [{ type: 'arrl-ss', ourSerial: 22, theirSerial: '89', theirPrecedence: 'Q', theirCheck: '79', theirSection: 'TER' }],
        },
      ]

      const records = await Promise.all(qsos.map(async (qso) => {
        const fields = await contest.runHook('adifFields', 'fieldsForOneQSO', { operation, qso }) as { name: string; value: string }[]
        const record = Object.fromEntries(fields.map(({ name, value }) => [name.toLowerCase(), value]))
        if (path === 'individual fields') {
          delete record.stx_string
          delete record.srx_string
        } else if (path === 'exchange strings') {
          for (const name of ['stx', 'srx', 'precedence', 'check', 'arrl_sect']) delete record[name]
        }
        return { fields: record }
      }))
      const imported = await contest.runHook('adifImport', 'refsForRecords', { records }) as (AdifImportResult | null)[]
      assert.equal(imported.length, qsos.length)

      const restored = qsos.map((qso, index): Record<string, JSONValue> => {
        const refs = imported[index]?.refs ?? []
        assert.deepEqual(refs, [{
          type: 'arrl-ss',
          ref: '',
          ourSerial: String(21 + index),
          theirSerial: index === 0 ? '7' : '89',
          theirPrecedence: index === 0 ? 'U' : 'Q',
          theirCheck: index === 0 ? '00' : '79',
          theirSection: index === 0 ? 'GH' : 'TER',
        }])
        return { ...qso, refs: refs as unknown as JSONValue }
      })

      const scored = await contest.runHook('scoring', 'scoreQsos', { operation, qsos: restored }) as ScoreQsosResult
      for (const [index, qso] of restored.entries()) {
        const score = scored.qsoScores[String(qso.uuid)]
        assert.equal(score.value, 2)
        assert.equal(score.section, index === 0 ? 'GH' : 'TER')
        assert.deepEqual(score.alerts ?? [], [])
      }
      assert.equal(scored.operationSummary['arrl-ss'].total, 8)
      assert.equal(scored.operationSummary['arrl-ss'].mults, 2)

      const cabrillo = async (contacts: Record<string, JSONValue>[]) => {
        const exported = await contest.runHook('export', 'generateExport', {
          operation,
          qsos: contacts,
          exportType: 'arrl-ss-cabrillo',
        }) as ExportResult
        return exported.content
      }
      assert.equal(await cabrillo(restored), await cabrillo(qsos))
    })
  }
}
