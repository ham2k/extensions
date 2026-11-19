// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { SECTION_SHAPES } from './arrlSections.ts'
import { SHADING_BOUNDS, deflateRuns, onebitPng, scaleFor, shadeSections, shadedSectionAt, shadingImage, shadingWhole } from './shading.ts'

const pixel = (bits: Uint8Array, lat: number, lon: number) => {
  const step = (SHADING_BOUNDS.east - SHADING_BOUNDS.west) / 2048
  const x = Math.floor((lon - SHADING_BOUNDS.west) / step), y = Math.floor((SHADING_BOUNDS.north - lat) / step)
  return (bits[y * 256 + (x >> 3)] >> (7 - (x & 7))) & 1
}

test('deflate that zlib reads back: runs, short runs and bytes that change', () => {
  const data = new Uint8Array(70000)
  for (let i = 0; i < data.length; i++) data[i] = i % 1000 < 600 ? 0 : i % 7 < 3 ? 255 : (i * 31) & 255
  assert.deepEqual(new Uint8Array(inflateSync(deflateRuns(data))), data)
  assert.deepEqual(new Uint8Array(inflateSync(deflateRuns(Uint8Array.of(5, 5, 5, 5, 9, 9)))), Uint8Array.of(5, 5, 5, 5, 9, 9))
})

test('a section is shaded inside its lines and nowhere else', () => {
  const bits = shadeSections(['KS', 'ENY'], '110m')
  assert.equal(pixel(bits, 38.5, -98.4), 1) // the middle of Kansas
  assert.equal(pixel(bits, 38.5, -92), 0) // Missouri
  assert.equal(pixel(bits, 42.6, -73.8), 1) // Albany, in ENY
  assert.equal(pixel(bits, 43.0, -76.1), 0) // Syracuse, in WNY
  const ontario = shadeSections(['ONE'], '50m')
  assert.equal(pixel(ontario, 45.42, -75.69), 1) // Ottawa
  assert.equal(pixel(ontario, 43.65, -79.38), 0) // Toronto, in GH
})

test('the shading lies on the land and lakes the map draws at its scale', () => {
  // Every row the picture's width, every row there, nothing left over.
  assert.ok(shadingWhole('110m'))
  assert.ok(shadingWhole('50m'))
  assert.equal(scaleFor(0), '110m')
  assert.equal(scaleFor(2.9), '110m')
  assert.equal(scaleFor(3), '50m')
  // Lake Simcoe is a lake at 1:50m only, land at 1:110m and its nearest shore's section (York's);
  // Lake Michigan is one at both.
  for (const scale of ['110m', '50m'] as const) {
    assert.equal(pixel(shadeSections(['GH'], scale), 44.42, -79.38), scale === '110m' ? 1 : 0, scale)
    assert.equal(shadedSectionAt(44.42, -79.38, scale), scale === '110m' ? 'GH' : undefined, scale)
    assert.equal(shadedSectionAt(43.5, -87, scale), undefined, scale)
    assert.equal(shadedSectionAt(38.5, -98.4, scale), 'KS', scale)
    assert.equal(shadedSectionAt(30, -40, scale), undefined, scale) // the Atlantic
    assert.equal(shadedSectionAt(80, -100, scale), undefined, scale) // past the picture
  }
  // Every section the outlines have is shaded at both scales, but the Virgin Islands, which the map
  // draws only from 1:50m.
  for (const scale of ['110m', '50m'] as const) {
    for (const section of Object.keys(SECTION_SHAPES)) if (section !== 'VI' || scale === '50m') assert.ok(shadeSections([section], scale).some(b => b !== 0), `${section} at ${scale}`)
  }
})

test('a PNG of the shading, small enough to send on every render', () => {
  const png = onebitPng(shadeSections(Object.keys(SECTION_SHAPES), '50m'), '#808080')
  assert.deepEqual([...png.subarray(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG')
  const idat = png.indexOf(0x49, 33) // the IDAT chunk follows IHDR, PLTE and tRNS
  const length = (png[idat - 4] << 24) | (png[idat - 3] << 16) | (png[idat - 2] << 8) | png[idat - 1]
  assert.equal(inflateSync(png.subarray(idat + 4, idat + 4 + length)).length, 1024 * 257)
  assert.ok(png.length < 60_000, `${png.length} bytes`)
  assert.match(shadingImage(['KS'], '#808080', '110m'), /^data:image\/png;base64,iVBORw0KGgo/)
})
