// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sectionAt, sectionForStation } from './sectionLookup.ts'

test('a place is in the section whose outline holds it', () => {
  assert.equal(sectionAt(42.65, -73.75), 'ENY') // Albany
  assert.equal(sectionAt(43.05, -76.15), 'WNY') // Syracuse
  assert.equal(sectionAt(34.05, -118.25), 'LAX')
  assert.equal(sectionAt(38.5, -98.4), 'KS')
  assert.equal(sectionAt(49.9, -97.1), 'MB') // Winnipeg
  assert.equal(sectionAt(30, -40), undefined) // the Atlantic
})

test('a station’s section: its own word, then its place, then its state where that is a section', () => {
  assert.equal(sectionForStation({ call: 'W1AW', arrlSection: 'ct' }), 'CT')
  assert.equal(sectionForStation({ call: 'K2ABC', grid: 'FN32ep' }), 'ENY') // by Albany
  assert.equal(sectionForStation({ call: 'K2ABC', guess: { grid: 'FN13ed' } }), 'WNY') // Rochester
  assert.equal(sectionForStation({ call: 'N0XYZ', guess: { state: 'KS' } }), 'KS')
  assert.equal(sectionForStation({ call: 'W6ABC', guess: { state: 'CA' } }), undefined) // nine sections
  assert.equal(sectionForStation({ call: 'VE4ABC', state: 'MB' }), 'MB')
  assert.equal(sectionForStation({ call: 'VK8ABC', state: 'NT' }), undefined) // Australia's Northern Territory
  assert.equal(sectionForStation({ call: 'K3LR' }), undefined)
})
