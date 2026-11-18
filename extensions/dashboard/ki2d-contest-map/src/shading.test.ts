// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { SECTION_SHAPES } from './arrlSections.ts'
import { SHADING_BOUNDS, deflateRuns, onebitPng, shadeSections, shadingImage } from './shading.ts'

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
  const bits = shadeSections(['KS', 'ENY'])
  assert.equal(pixel(bits, 38.5, -98.4), 1) // the middle of Kansas
  assert.equal(pixel(bits, 38.5, -92), 0) // Missouri
  assert.equal(pixel(bits, 42.6, -73.8), 1) // Albany, in ENY
  assert.equal(pixel(bits, 43.0, -76.1), 0) // Syracuse, in WNY
  assert.equal(shadeSections(['ONE']).some(b => b !== 0), false) // no outline yet
})

test('a PNG of the shading, small enough to send on every render', () => {
  const png = onebitPng(shadeSections(Object.keys(SECTION_SHAPES)), '#808080')
  assert.deepEqual([...png.subarray(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG')
  const idat = png.indexOf(0x49, 33) // the IDAT chunk follows IHDR, PLTE and tRNS
  const length = (png[idat - 4] << 24) | (png[idat - 3] << 16) | (png[idat - 2] << 8) | png[idat - 1]
  assert.equal(inflateSync(png.subarray(idat + 4, idat + 4 + length)).length, 1024 * 257)
  assert.ok(png.length < 60_000, `${png.length} bytes`)
  assert.match(shadingImage(['KS'], '#808080'), /^data:image\/png;base64,iVBORw0KGgo/)
})
