// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The sections worked, shaded: the map fills no areas of its own, but lays a picture on the world
// by latitude and longitude. So each section's outline is filled into a two-colour PNG over North
// America, plate carrée as the map wants it, and handed over as a `data:` URI.
import { LAKE_SHAPES, SECTION_SHAPES } from './arrlSections.ts'

/** The picture's edges, and its pixels, square in degrees: Hawaii to Newfoundland, the Caribbean to the Arctic. */
export const SHADING_BOUNDS = { north: 72, south: 12, west: -170, east: -50 }
const WIDTH = 2048, HEIGHT = 1024, STEP = (SHADING_BOUNDS.east - SHADING_BOUNDS.west) / WIDTH
const ROW_BYTES = WIDTH / 8

/** Sets each pixel whose middle `rings` cover, even-odd, in `bits`. */
function fill(bits: Uint8Array, rings: readonly (readonly number[])[]) {
  // Where each row's middle crosses the rings' edges; filled between them in pairs.
  const crossings: number[][] = Array.from({ length: HEIGHT }, () => [])
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length
      const y0 = (SHADING_BOUNDS.north - ring[i]) / STEP, x0 = (ring[i + 1] - SHADING_BOUNDS.west) / STEP
      const y1 = (SHADING_BOUNDS.north - ring[j]) / STEP, x1 = (ring[j + 1] - SHADING_BOUNDS.west) / STEP
      if (y0 === y1) continue
      const top = Math.max(0, Math.ceil(Math.min(y0, y1) - 0.5)), bottom = Math.min(HEIGHT - 1, Math.ceil(Math.max(y0, y1) - 0.5) - 1)
      for (let row = top; row <= bottom; row++) crossings[row].push(x0 + ((row + 0.5 - y0) / (y1 - y0)) * (x1 - x0))
    }
  }
  crossings.forEach((xs, row) => {
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(WIDTH - 1, Math.ceil(xs[k + 1] - 0.5) - 1)
      for (let x = from; x <= to; x++) bits[row * ROW_BYTES + (x >> 3)] |= 0x80 >> (x & 7)
    }
  })
}

let lakes: Uint8Array | undefined
/** The lakes' pixels, once: the map draws them as water, and a section runs across its lakes. */
function lakeMask() {
  if (!lakes) fill((lakes = new Uint8Array(ROW_BYTES * HEIGHT)), LAKE_SHAPES)
  return lakes
}

/** Each pixel a bit, set where one of `sections` covers its middle and no lake does. */
export function shadeSections(sections: Iterable<string>): Uint8Array {
  const bits = new Uint8Array(ROW_BYTES * HEIGHT)
  for (const section of sections) {
    const rings = SECTION_SHAPES[section]
    if (rings) fill(bits, rings)
  }
  const water = lakeMask()
  for (let i = 0; i < bits.length; i++) bits[i] &= ~water[i]
  return bits
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
/** Some sections as a picture for the map, filled in `color`. */
export function shadingImage(sections: Iterable<string>, color: string): string {
  const list = [...new Set(sections)].filter(s => SECTION_SHAPES[s]).sort(), key = `${color}:${list.join(',')}`
  const uri = made.get(key) ?? `data:image/png;base64,${base64(onebitPng(shadeSections(list), color))}`
  made.delete(key)
  made.set(key, uri)
  while (made.size > 6) made.delete(made.keys().next().value!)
  return uri
}
