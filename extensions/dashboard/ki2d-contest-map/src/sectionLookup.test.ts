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

test("Ontario's four sections, by its census divisions", () => {
  const places: [number, number, string, string][] = [
    [43.65, -79.38, 'GH', 'Toronto'], [43.25, -79.87, 'GH', 'Hamilton'], [43.09, -79.08, 'GH', 'Niagara Falls'], [43.9, -78.86, 'GH', 'Oshawa'],
    [45.42, -75.69, 'ONE', 'Ottawa'], [44.23, -76.48, 'ONE', 'Kingston'], [44.3, -78.32, 'ONE', 'Peterborough'], [44.36, -78.74, 'ONE', 'Lindsay, Kawartha Lakes'],
    [45.58, -78.4, 'ONE', 'Algonquin Park, in Nipissing'], [45.5, -78.07, 'ONE', 'South Algonquin, in Nipissing'],
    [48.38, -89.25, 'ONN', 'Thunder Bay'], [46.49, -81.0, 'ONN', 'Sudbury'], [46.31, -79.46, 'ONN', 'North Bay'], [49.77, -94.49, 'ONN', 'Kenora'],
    [42.98, -81.25, 'ONS', 'London'], [43.45, -80.49, 'ONS', 'Kitchener'], [44.39, -79.69, 'ONS', 'Barrie'], [45.33, -79.22, 'ONS', 'Huntsville, Muskoka'], [45.35, -80.04, 'ONS', 'Parry Sound'],
  ]
  for (const [lat, lon, section, name] of places) assert.equal(sectionAt(lat, lon), section, name)
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
