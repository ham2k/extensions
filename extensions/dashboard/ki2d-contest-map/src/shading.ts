// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The sections worked, shaded: the map fills no areas of its own, but lays a picture on the world
// by latitude and longitude. So the sections are filled into a two-colour PNG over North America,
// plate carrée as the map wants it, and handed over as a `data:` URI. Which pixel is in which section
// comes worked out for each of the two scales the map draws the world at (tools/arrl-sections.mjs),
// so the shading lies on the land and lakes the map draws, not the county lines' coasts.
import { SECTION_SHAPES, SHADING_GRID, SHADING_RASTERS, SHADING_SECTIONS } from './arrlSections.ts'

/** The picture's edges, and its pixels, square in degrees: Hawaii to Newfoundland, the Caribbean to the Arctic. */
export const SHADING_BOUNDS = { north: SHADING_GRID.north, south: SHADING_GRID.south, west: SHADING_GRID.west, east: SHADING_GRID.east }
const WIDTH = SHADING_GRID.width, HEIGHT = SHADING_GRID.height, STEP = (SHADING_GRID.east - SHADING_GRID.west) / WIDTH
const ROW_BYTES = WIDTH / 8

/** The map's two scales: Natural Earth's 1:110m land and lakes on the whole world, 1:50m's from zoom 3. */
export type Scale = keyof typeof SHADING_RASTERS
export const scaleFor = (zoom: number): Scale => (zoom >= 3 ? '50m' : '110m')

/**
 * A scale's raster read once: its runs, each a length and a section's number, and where each row's
 * begin. One that doesn't read back whole, every row the picture's width and nothing left over, is
 * no raster at all: shading from a string damaged in an edit would paint sections over the sea.
 */
const decoded = new Map<Scale, { runs: Uint16Array; rows: Uint32Array; whole: boolean }>()
function raster(scale: Scale) {
  let found = decoded.get(scale)
  if (found) return found
  const text = SHADING_RASTERS[scale], bytes: number[] = []
  for (let i = 0, acc = 0, held = 0; i < text.length; i++) {
    const n = BASE64.indexOf(text[i])
    if (n < 0) continue
    acc = (acc << 6) | n; held += 6
    if (held >= 8) { held -= 8; bytes.push((acc >> held) & 255) }
  }
  const runs: number[] = [], rows = new Uint32Array(HEIGHT + 1)
  let at = 0, row = 0, x = 0, whole = true
  while (whole && at < bytes.length && row < HEIGHT) {
    let length = 0
    for (let shift = 0; at < bytes.length; shift += 7) {
      const b = bytes[at++]
      length |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
    }
    const code = bytes[at++]
    runs.push(length, code)
    x += length
    if (!length || x > WIDTH || code === undefined || code > SHADING_SECTIONS.length) whole = false
    else if (x === WIDTH) { rows[++row] = runs.length; x = 0 }
  }
  whole &&= row === HEIGHT && at === bytes.length
  found = whole ? { runs: Uint16Array.from(runs), rows, whole } : { runs: new Uint16Array(0), rows: new Uint32Array(HEIGHT + 1), whole }
  if (!whole) console.error(`[contest-map] the ${scale} shading doesn't read back whole: no shading at that scale`)
  decoded.set(scale, found)
  return found
}

/** Whether `scale`'s raster reads back whole. */
export const shadingWhole = (scale: Scale) => raster(scale).whole

/** Each pixel a bit, set where it is in one of `sections` at `scale`: on the land the map draws then. */
export function shadeSections(sections: Iterable<string>, scale: Scale): Uint8Array {
  const wanted = new Set([...sections].map(s => SHADING_SECTIONS.indexOf(s) + 1).filter(n => n > 0))
  const bits = new Uint8Array(ROW_BYTES * HEIGHT), { runs, rows } = raster(scale)
  for (let row = 0; row < HEIGHT; row++) {
    for (let i = rows[row], x = 0; i < rows[row + 1]; i += 2) {
      const length = runs[i]
      if (wanted.has(runs[i + 1])) for (let p = x; p < x + length; p++) bits[row * ROW_BYTES + (p >> 3)] |= 0x80 >> (p & 7)
      x += length
    }
  }
  return bits
}

/** The section the map shades at a place at `scale`, as `shadeSections` does: none on water it draws. */
export function shadedSectionAt(lat: number, lon: number, scale: Scale): string | undefined {
  const row = Math.floor((SHADING_GRID.north - lat) / STEP), x = Math.floor((lon - SHADING_GRID.west) / STEP)
  if (row < 0 || row >= HEIGHT || x < 0 || x >= WIDTH) return undefined
  const { runs, rows } = raster(scale)
  for (let i = rows[row], start = 0; i < rows[row + 1]; i += 2) {
    if (x < start + runs[i]) return SHADING_SECTIONS[runs[i + 1] - 1]
    start += runs[i]
  }
  return undefined
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const LENGTH_BASES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]

/**
 * zlib's deflate, enough of it for a picture that is mostly runs: one block of the fixed codes, each
 * run of a byte a literal and then copies of the byte before.
 */
export function deflateRuns(data: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01]
  let acc = 0, held = 0
  const bits = (value: number, count: number) => { // least significant first
    acc |= value << held; held += count
    while (held >= 8) { out.push(acc & 0xff); acc >>>= 8; held -= 8 }
  }
  const code = (value: number, count: number) => { // a Huffman code: most significant first
    for (let i = count - 1; i >= 0; i--) bits((value >> i) & 1, 1)
  }
  const literal = (byte: number) => (byte < 144 ? code(0x30 + byte, 8) : code(0x190 + byte - 144, 9))
  bits(1, 1); bits(1, 2) // the last block, fixed codes
  for (let i = 0; i < data.length;) {
    literal(data[i])
    let run = 0
    while (i + 1 + run < data.length && data[i + 1 + run] === data[i] && run < 258 * 1024) run++
    i += 1 + run
    while (run >= 3) {
      const length = Math.min(run, 258)
      let n = LENGTH_BASES.length - 1
      while (LENGTH_BASES[n] > length) n--
      const symbol = 257 + n
      if (symbol < 280) code(symbol - 256, 7); else code(0xc0 + symbol - 280, 8)
      bits(length - LENGTH_BASES[n], LENGTH_EXTRA[n])
      code(0, 5) // distance 1
      run -= length
    }
    for (; run > 0; run--) literal(data[i - run])
  }
  code(0, 7) // end of block
  if (held) out.push(acc & 0xff)
  let a = 1, b = 0
  for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521 }
  out.push(b >>> 8, b & 0xff, a >>> 8, a & 0xff)
  return Uint8Array.from(out)
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    text += BASE64[n >> 18] + BASE64[(n >> 12) & 63] + (i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? BASE64[n & 63] : '=')
  }
  return text
}

/** A one-bit PNG of `bits`, clear where unset and `color` (`#RRGGBB`) where set. */
export function onebitPng(bits: Uint8Array, color: string): Uint8Array {
  const rowBytes = WIDTH / 8, raw = new Uint8Array((rowBytes + 1) * HEIGHT)
  for (let row = 0; row < HEIGHT; row++) raw.set(bits.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
  const rgb = /^#?([0-9a-f]{6})$/i.exec(color)?.[1] ?? '808080'
  const chunks: [string, number[] | Uint8Array][] = [
    ['IHDR', [WIDTH >>> 24, (WIDTH >> 16) & 255, (WIDTH >> 8) & 255, WIDTH & 255, HEIGHT >>> 24, (HEIGHT >> 16) & 255, (HEIGHT >> 8) & 255, HEIGHT & 255, 1, 3, 0, 0, 0]],
    ['PLTE', [0, 0, 0, parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4), 16)]],
    ['tRNS', [0, 255]],
    ['IDAT', deflateRuns(raw)],
    ['IEND', []],
  ]
  const size = 8 + chunks.reduce((n, [, body]) => n + 12 + body.length, 0)
  const out = new Uint8Array(size), word = (at: number, n: number) => { out[at] = n >>> 24; out[at + 1] = (n >> 16) & 255; out[at + 2] = (n >> 8) & 255; out[at + 3] = n & 255 }
  out.set([137, 80, 78, 71, 13, 10, 26, 10])
  let at = 8
  for (const [type, body] of chunks) {
    word(at, body.length)
    for (let i = 0; i < 4; i++) out[at + 4 + i] = type.charCodeAt(i)
    out.set(body, at + 8)
    word(at + 8 + body.length, crc32(out.subarray(at + 4, at + 8 + body.length)))
    at += 12 + body.length
  }
  return out
}

/** The last few pictures made, newest last: the same sections in the same colour make the same one. */
const made = new Map<string, string>()
/** Some sections as a picture for the map at `scale`, filled in `color`. */
export function shadingImage(sections: Iterable<string>, color: string, scale: Scale): string {
  const list = [...new Set(sections)].filter(s => SECTION_SHAPES[s]).sort(), key = `${scale}:${color}:${list.join(',')}`
  const uri = made.get(key) ?? `data:image/png;base64,${base64(onebitPng(shadeSections(list, scale), color))}`
  made.delete(key)
  made.set(key, uri)
  while (made.size > 6) made.delete(made.keys().next().value!)
  return uri
}
