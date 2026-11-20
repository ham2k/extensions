// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The last hour's contacts on the band the station is on, a dot apiece on the app's map of the
// world, in its band's colour. Under SO2R, Radio B's band too. A dot fades as its contact ages,
// and each band's newest is drawn larger. Smaller dots are the stations spotted on those bands that
// are not in the log yet. The band comes from each radio's dial, and with no radio to read, from the
// logging fields. In Sweepstakes the map starts framed on the ARRL and RAC sections, the sections
// worked are shaded, those not worked yet with stations spotted in them are lit up, and a pointer
// resting on one outlines it and names it.
import { entityPrefixForCall } from '@ham2k/extension-sdk'
import type { BoardSpot, JSONValue, PanelEnvironment, PanelHook, PanelSceneMap, PanelScenePatch, PanelRadioState, PanelScene, PanelSceneControl, PanelSceneLayer, PanelSceneMapMarker } from '@ham2k/extension-sdk'
import { gridToLocation, locationForQSONInfo } from '@ham2k/lib-geo-tools'
import { themePalette } from '@ham2k/lib-panel-themes'
import { bandForFrequency } from '@ham2k/lib-operation-data'

import { SECTION_LINES, SECTION_SHAPES } from './arrlSections.ts'
import { SECTION_NAMES, sectionForStation } from './sectionLookup.ts'
import { SHADING_BOUNDS, scaleFor, shadedSectionAt, shadingImage } from './shading.ts'

const en = {
  title: 'KI2D’s Contest Map', description: 'The last hour’s contacts on your band, on a map',
  style: 'Map style', styles: { default: 'The app’s', color: 'Color', gray: 'Gray', muted: 'Muted', contrast: 'High contrast', teal: 'Teal' },
  grayline: 'Show day and night', rings: 'Distance rings', ringsOff: 'None', every: (n: string) => `Every ${n}`,
  update: 'This panel needs a newer version of Ham2K Logger.', noLog: 'This panel cannot read the log here.',
  map: 'Contacts in the last hour', noBand: 'No band yet',
  count: (n: number) => n === 1 ? '1 QSO' : `${n} QSOs`,
  spots: (n: number) => n === 1 ? '1 spot' : `${n} spots`,
}
const es: typeof en = {
  title: 'Mapa de concurso de KI2D', description: 'Los contactos de la última hora en tu banda, en un mapa',
  style: 'Estilo del mapa', styles: { default: 'El de la app', color: 'Color', gray: 'Gris', muted: 'Apagado', contrast: 'Alto contraste', teal: 'Verde azulado' },
  grayline: 'Mostrar el día y la noche', rings: 'Anillos de distancia', ringsOff: 'Ninguno', every: (n: string) => `Cada ${n}`,
  update: 'Este panel necesita una versión más reciente de Ham2K Logger.', noLog: 'Este panel no puede leer el registro aquí.',
  map: 'Contactos en la última hora', noBand: 'Sin banda todavía',
  count: (n: number) => n === 1 ? '1 QSO' : `${n} QSOs`,
  spots: (n: number) => n === 1 ? '1 spot' : `${n} spots`,
}
const words = (locale?: string) => locale?.startsWith('es') ? es : en

export type ContestMapHost = {
  /** `A` for the logging radio, `B` for SO2R's Radio B, whose answer has every field empty while there is none. */
  readRadio(id?: string): Promise<PanelRadioState | null>
  /** A line in the app's extension log. */
  log?(message: string): void
}

export const HOUR = 60 * 60_000
/** Each band's dots, running from red through the spectrum as the bands go up. */
export const BAND_COLORS: Record<string, string> = {
  '160m': '#6D4C41', '80m': '#E53935', '60m': '#AD1457', '40m': '#FB8C00', '30m': '#9E9D24', '20m': '#43A047', '17m': '#00897B',
  '15m': '#1E88E5', '12m': '#3949AB', '10m': '#8E24AA', '6m': '#EC407A', '4m': '#795548', '2m': '#546E7A', '1.25m': '#26A69A', '70cm': '#00ACC1',
}
export const bandColor = (band: string) => BAND_COLORS[band] ?? '#757575'
/** How faint an hour-old dot gets. */
const OLDEST_OPACITY = 0.3
/** The legend's text, as a share of the label typography's size. */
const LEGEND_SCALE = 0.85
const MAX_MARKERS = 4000
/** How long a spot stays on the map: in a contest a station spotted longer ago has likely moved on. */
export const SPOT_MAX_AGE_MINUTES = 30
const MAX_SPOTS = 1000

export type LoggingSet = 'A' | 'B'
/** A band shown, and the logging sets on it: one, or both when the two radios share it. */
export type Shown = { band: string; sets: LoggingSet[] }
type Place = { lat: number; lon: number }
type Qso = Record<string, JSONValue>

const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const real = (grid: unknown): grid is string => typeof grid === 'string' && grid.length >= 4 && !/^AA00/i.test(grid)
/** A place, when these are one on Earth: a grid's letters past R give none, but no error either. */
const onEarth = (lat: unknown, lon: unknown): Place | undefined =>
  finite(lat) && finite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined
function fromGrid(grid: string): Place | undefined {
  try {
    const [lat, lon] = gridToLocation(grid)
    return onEarth(lat, lon)
  } catch { return undefined }
}

/**
 * Where a contact's dot goes: the most precise place the log knows for the station. Its own
 * coordinates or grid first, then the lookup's guess, then its state or entity, and last the
 * entity its call belongs to.
 */
export function qsoPlace(qso: Qso): Place | undefined {
  const their = obj(qso.their), guess = obj(their.guess)
  if (finite(their.lat) && finite(their.lon)) return { lat: their.lat, lon: their.lon }
  const gridded = real(their.grid) ? fromGrid(their.grid) : undefined
  if (gridded) return gridded
  if (finite(guess.lat) && finite(guess.lon)) return { lat: guess.lat, lon: guess.lon }
  // Without a grid that gave no place, which the lookups below would otherwise take first.
  const known = { ...their, grid: undefined } as Parameters<typeof locationForQSONInfo>[0]
  const broad = locationForQSONInfo(known)
  const broadly = broad && onEarth(broad.latitude, broad.longitude)
  if (broadly) return broadly
  const call = typeof their.call === 'string' ? their.call : undefined
  const entityPrefix = call ? entityPrefixForCall(call) : undefined
  // With the state kept, as a contest's exchange may give it (Sweepstakes' section, a QSO party's).
  const entity = entityPrefix ? locationForQSONInfo({ ...known, entityPrefix }) : null
  return entity ? onEarth(entity.latitude, entity.longitude) : undefined
}

const bandForHz = (hz: unknown) => {
  if (!finite(hz) || hz <= 0) return undefined
  const band = bandForFrequency(hz / 1000)
  return band && band !== 'other' ? band : undefined
}
const isBand = (band: unknown): band is string => typeof band === 'string' && band !== '' && band !== 'event' && band !== 'other'

/**
 * The bands to show: Radio A's and, under SO2R, Radio B's, each from its dial. With no radio
 * answering for A, the logging fields' band, and with none there either, the band of the latest
 * contact. Two radios on one band show it once.
 */
export function shownBands(radioA: PanelRadioState | null, radioB: PanelRadioState | null, draft: Qso | undefined, qsos: Qso[]): Shown[] {
  let a = bandForHz(radioA?.frequencyHz) ?? (isBand(draft?.band) ? draft.band : undefined)
  if (!a) for (let i = qsos.length - 1; i >= 0 && !a; i--) if (isBand(qsos[i].band)) a = qsos[i].band as string
  const b = bandForHz(radioB?.frequencyHz)
  if (a && b && a === b) return [{ band: a, sets: ['A', 'B'] }]
  return [...(a ? [{ band: a, sets: ['A' as const] }] : []), ...(b ? [{ band: b, sets: ['B' as const] }] : [])]
}

export type Dot = Place & { id: string; band: string; ageMillis: number; newest: boolean }

/** The contacts of the last hour on the bands shown, oldest first so the newest draw on top. */
export function dotsFor(qsos: Qso[], shown: Shown[], now: number): { dots: Dot[]; counts: number[] } {
  const counts = shown.map(() => 0), dots: Dot[] = [], newest = new Map<number, number>()
  qsos.forEach((qso, index) => {
    const time = qso.startAtMillis
    if (!finite(time) || time > now || now - time > HOUR) return
    const group = shown.findIndex(s => s.band === qso.band)
    if (group < 0) return
    counts[group]++
    const place = qsoPlace(qso)
    if (!place) return
    if ((dots[newest.get(group) ?? -1]?.ageMillis ?? Infinity) >= now - time) newest.set(group, dots.length)
    dots.push({ ...place, id: `q${index}`, band: shown[group].band, ageMillis: now - time, newest: false })
  })
  for (const at of newest.values()) dots[at].newest = true
  dots.sort((x, y) => y.ageMillis - x.ageMillis)
  return { dots: dots.slice(-MAX_MARKERS), counts }
}

/**
 * The stations spotted on the bands shown in the last half hour that the log has no contact with,
 * a dot each (the latest spot of a call on a band), how many on each band, and the sections they
 * are in, as far as can be told.
 */
export function spotDotsFor(spots: BoardSpot[], shown: Shown[], now: number): Spotted {
  const counts = shown.map(() => 0), latest = new Map<string, { spot: BoardSpot; group: number; age: number }>()
  for (const spot of spots) {
    if (spot.annotations?.worked || spot.annotations?.isSelf) continue
    const call = String(spot.their?.call ?? '').toUpperCase(), time = spot.spot?.timeInMillis
    const band = spot.band ?? (finite(spot.freq) ? bandForFrequency(spot.freq) : undefined)
    const group = shown.findIndex(s => s.band === band)
    if (!call || group < 0 || !finite(time) || now - time > SPOT_MAX_AGE_MINUTES * 60_000) continue
    const key = `${group}:${call}`, age = Math.max(0, now - time)
    if ((latest.get(key)?.age ?? Infinity) > age) latest.set(key, { spot, group, age })
  }
  const dots: Dot[] = [], sections = new Set<string>()
  for (const { spot, group, age } of latest.values()) {
    counts[group]++
    const their = spottedStation(spot)
    const place = qsoPlace({ their } as unknown as Qso), section = sectionForStation(their)
    if (section) sections.add(section)
    if (place) dots.push({ ...place, id: `s${dots.length}`, band: shown[group].band, ageMillis: age, newest: false })
  }
  dots.sort((x, y) => y.ageMillis - x.ageMillis)
  return { dots: dots.slice(-MAX_SPOTS), counts, sections: [...sections] }
}

/**
 * A spotted station as the map reads it: what the spot says of it, with what the app's offline
 * lookups guess of it (`spot.guess`, from extension API 28; `their.guess` before) as its guess.
 * A guessed state alone places it where a contact known by its state alone goes.
 *
 * Only the parts of the guess that can be used are kept: a part that cannot (a grid off the
 * Earth, a section the map doesn't know) would otherwise stop the dot from being placed, or
 * light no section, where the rest of what is known would have. A section only for a W or VE
 * call, as for one worked.
 */
export function spottedStation(spot: BoardSpot): Record<string, unknown> {
  const their = obj(spot.their)
  const raw = obj(spot.guess ?? their.guess)
  const word = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim().toUpperCase() : undefined)
  const call = typeof their.call === 'string' ? their.call : ''
  const section = word(raw.arrlSection)
  const guess = {
    state: word(raw.state),
    arrlSection: section && SECTION_NAMES[section] && /^(K|VE|VO|VY)/.test(entityPrefixForCall(call) ?? '') ? section : undefined,
    grid: real(raw.grid) && fromGrid(raw.grid) ? raw.grid : undefined,
    ...onEarth(raw.lat, raw.lon),
  }
  return { ...their, guess: Object.fromEntries(Object.entries(guess).filter(([, value]) => value !== undefined)) }
}

type Stops = [number, number][]
/** A contact's dot, in pixels across: 3.5 on the whole world, growing to 7 at zoom 6. */
const QSO_RADIUS: Stops = [[0, 3.5], [6, 7]]
/** A spotted station's: much smaller. */
const SPOT_RADIUS: Stops = [[0, 1.6], [6, 3.2]]
const radiusAt = (stops: Stops, zoom: number) => stops[0][1] + (stops[1][1] - stops[0][1]) * Math.max(0, Math.min(1, zoom / stops[1][0]))
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360))

/**
 * Dots at one place (a state's or a country's middle, where that is all the log knows) fanned
 * out round it, a sunflower's seeds, the last of them in the middle and the first outermost: each
 * one shows, overlapping its neighbours a little. Worked out in pixels at the map's `zoom`, where `side` is the whole world's
 * size at zoom 0, the pane's tighter side, and laid back on the Earth in Web Mercator.
 */
export function spreadStacks(dots: Dot[], zoom: number, side: number): Dot[] {
  const stacks = new Map<string, number[]>()
  dots.forEach((dot, i) => {
    const key = `${dot.lat.toFixed(4)},${dot.lon.toFixed(4)}`
    stacks.set(key, [...(stacks.get(key) ?? []), i])
  })
  const spread = dots.slice(), world = side * 2 ** zoom, step = radiusAt(QSO_RADIUS, zoom) * 0.8
  for (const stack of stacks.values()) {
    if (stack.length < 2) continue
    stack.reverse().forEach((index, n) => {
      if (n === 0) return
      const dot = dots[index], r = step * Math.sqrt(n), angle = n * 2.39996
      const dx = r * Math.cos(angle), dy = r * Math.sin(angle)
      const y = mercator(dot.lat) - (dy * 2 * Math.PI) / world
      spread[index] = { ...dot, lon: dot.lon + (dx * 360) / world, lat: (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI }
    })
  }
  return spread
}

/** `#RRGGBB` or `#AARRGGBB` at `opacity`, as `#AARRGGBB`. */
export function withAlpha(color: string, opacity: number) {
  return `#${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0').toUpperCase()}${rgbOf(color).slice(1)}`
}

/** A colour as `#RRGGBB`, its alpha dropped: SVG reads eight digits as `#RRGGBBAA`, so its opacity goes in its own attribute. */
export function rgbOf(color: string) {
  const rgb = /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? /^#[0-9a-f]{2}([0-9a-f]{6})$/i.exec(color)?.[1] ?? '000000'
  return `#${rgb.toUpperCase()}`
}

export type View = { zoom?: number; lat?: number; lon?: number }
/** The section a pointer rests on, and where it rests, in the pane's pixels. */
export type Hover = { section: string; x: number; y: number }
/** How long a pointer rests on a section before it is outlined and named (the app's `dwell`, API 28). */
const DWELL_MS = 1500

/** A resting pointer's section: its outline in bold, and its name in a tag beside the pointer. */
export function hoverParts(e: PanelEnvironment, hover: Hover): { lines: NonNullable<PanelSceneMap['lines']>; layers: PanelSceneLayer[] } {
  const c = e.colors, style = e.typography.label, size = style.fontSize
  const text = `${hover.section} · ${SECTION_NAMES[hover.section] ?? hover.section}`
  const width = Math.max(1, Math.min(8192, e.width)), height = Math.max(1, Math.min(8192, e.height))
  const line = Math.ceil(style.scaledFontSize * style.lineHeight), pad = 6
  const boxW = Math.min(width - 8, Math.ceil(text.length * style.scaledFontSize * 0.6) + pad * 2), boxH = line + pad
  const x = Math.max(4, Math.min(width - boxW - 4, hover.x + 14)), y = Math.max(4, Math.min(height - boxH - 4, hover.y - boxH - 10))
  return {
    lines: (SECTION_SHAPES[hover.section] ?? []).map((ring, i) => ({ id: `hover-${i}`, style: 'hover', points: pairs(ring), closed: true })),
    layers: [
      { id: 'hover-box', x, y, width: boxW, height: boxH, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boxW} ${boxH}"><rect x="0.5" y="0.5" width="${boxW - 1}" height="${boxH - 1}" rx="5" fill="${rgbOf(c.surface)}" fill-opacity="0.92" stroke="${rgbOf(c.outline)}" stroke-opacity="0.9"/></svg>` },
      { id: 'hover-text', x: x + pad, y: y + pad / 2, width: boxW - pad * 2, height: line, text: { literal: text, size, fontFamily: style.fontFamily ?? undefined, fontWeight: 600, lineHeight: style.lineHeight, color: c.onSurface } },
    ],
  }
}

/** The patch steps that take a resting pointer's outline and tag away. */
function hoverRemoval(hover: Hover): PanelScenePatch {
  return [
    ...(SECTION_SHAPES[hover.section] ?? []).map((_, i) => ({ remove: ['controls', 'map', 'lines', `hover-${i}`] })),
    { remove: ['layers', 'hover-box'] },
    { remove: ['layers', 'hover-text'] },
  ]
}

/** Half the way round the Earth, the farthest a circle goes. */
const HALF_EARTH_KM = 20015
/** The distance rings on offer, each step and the unit its labels give it in. */
export const RING_STEPS: Record<string, { km: number; unit: 'mi' | 'km'; text: string }> = {
  '250mi': { km: 402.336, unit: 'mi', text: '250 mi' },
  '500mi': { km: 804.672, unit: 'mi', text: '500 mi' },
  '1000mi': { km: 1609.344, unit: 'mi', text: '1,000 mi' },
  '500km': { km: 500, unit: 'km', text: '500 km' },
  '1000km': { km: 1000, unit: 'km', text: '1,000 km' },
}
const PALETTES = ['color', 'gray', 'muted', 'contrast', 'teal'] as const
type Palette = (typeof PALETTES)[number]

/** A placement's settings, as the panel's form keeps them; anything else is the defaults. */
export type MapSettings = { palette?: Palette; grayline: boolean; rings?: (typeof RING_STEPS)[string] }
export function mapSettings(config: Record<string, JSONValue> | undefined): MapSettings {
  const style = config?.mapStyle, rings = typeof config?.rings === 'string' ? config.rings : '500mi'
  return {
    palette: PALETTES.find(p => p === style),
    grayline: config?.grayline !== false,
    rings: RING_STEPS[rings],
  }
}

/** The panel's settings, behind the gear beside it in Layout Setup. */
export function settingsForm(locale?: string) {
  const t = words(locale)
  return [
    { type: 'field' as const, fieldType: 'select' as const, key: 'mapStyle', label: t.style, value: 'default', options: [{ label: t.styles.default, value: 'default' }, ...PALETTES.map(p => ({ label: t.styles[p], value: p }))] },
    { type: 'field' as const, fieldType: 'checkbox' as const, key: 'grayline', label: t.grayline, value: true },
    { type: 'field' as const, fieldType: 'select' as const, key: 'rings', label: t.rings, value: '500mi', options: [{ label: t.ringsOff, value: 'off' }, ...Object.entries(RING_STEPS).map(([value, step]) => ({ label: t.every(step.text), value }))] },
  ]
}

const pairs = (flat: readonly number[]) => Array.from({ length: flat.length / 2 }, (_, i) => ({ lat: flat[2 * i], lon: flat[2 * i + 1] }))

export type Spotted = { dots: Dot[]; counts: number[]; sections?: string[] }

type Bounds = { north: number; south: number; west: number; east: number }
/** Where the sections are, but for the far north and the islands: the lower 48 and southern Canada. */
export const SECTIONS_FRAME: Bounds = { north: 56, south: 24, west: -126, east: -57 }
/** The zoom and middle that fit `bounds` in a pane, with a little room round them. */
export function fitView(bounds: Bounds, width: number, height: number): Required<View> {
  const side = Math.min(width, height), north = mercator(bounds.north), south = mercator(bounds.south)
  const across = (width * 0.94) / ((side * (bounds.east - bounds.west)) / 360), down = (height * 0.94) / ((side * (north - south)) / (2 * Math.PI))
  const zoom = Math.max(0, Math.log2(Math.min(across, down)))
  return { zoom, lon: (bounds.west + bounds.east) / 2, lat: ((2 * Math.atan(Math.exp((north + south) / 2)) - Math.PI / 2) * 180) / Math.PI }
}
/**
 * In Sweepstakes the land is gray, and the sections worked are painted back in the land's own colour:
 * the map fills in as the contest goes. The app's land on each of its palettes (as it has them), and
 * a gray of about its lightness for the rest.
 */
const PALETTE_LAND: Record<Palette, string> = { color: '#9E7E3D', gray: '#A3A3A3', muted: '#CDBF9F', contrast: '#F3E3A1', teal: '#D6EEF4' }
const GRAY_LAND: Record<Palette, string> = { color: '#B8B8B8', gray: '#D9D9D9', muted: '#C9C9C9', contrast: '#D6D6D6', teal: '#C2C2C2' }
/** The teal palette's water: the face of KI2D's other panels in their Teal, so that the map matches them. */
const TEAL = themePalette('teal')
/** As the app darkens its land in the dark, all but the teal palette's: a picture gets no such help. */
function landIn(palette: Palette, dark: boolean) {
  const color = PALETTE_LAND[palette]
  if (!dark || palette === 'teal') return color
  const channel = (i: number) => Math.round(parseInt(color.slice(i, i + 2), 16) * 0.65).toString(16).padStart(2, '0')
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase()
}
/** A section not worked yet with a station spotted in it: a light red, a multiplier on the air. */
const WANTED = { light: { color: '#EF5350', opacity: 0.3 }, dark: { color: '#E57373', opacity: 0.35 } }
/**
 * The coasts, the lines between countries and those between states, stronger than the app's own: a
 * contest map is read by where the lines fall. The coasts and borders one colour, and neutral, so
 * they sit on any of the map's palettes.
 */
const OUTLINES = {
  light: { coast: '#E6202020', borders: '#E6202020', divisions: '#B3303030' },
  dark: { coast: '#E6F2F2F2', borders: '#E6F2F2F2', divisions: '#B3D6D6D6' },
}

/** An ARRL Sweepstakes operation. */
export const isSweepstakes = (operation: Record<string, JSONValue>) =>
  Array.isArray(operation.refs) && operation.refs.some(ref => obj(ref).type === 'arrl-ss')
/** The sections the log has contacts in, as the Sweepstakes extension records them. */
export const workedSections = (qsos: Qso[]) =>
  [...new Set(qsos.map(qso => obj(qso.their).arrlSection).filter((s): s is string => typeof s === 'string' && s !== '').map(s => s.toUpperCase()))]

/** The map's zoom: the operator's, else the sections' frame in Sweepstakes, else the whole world. */
export function mapZoom(e: PanelEnvironment, view: View, sweepstakes: boolean): number {
  const width = Math.max(1, Math.min(8192, e.width)), height = Math.max(1, Math.min(8192, e.height))
  return view.zoom ?? (sweepstakes ? fitView(SECTIONS_FRAME, width, height).zoom : 0)
}

/** With `sections`, the sections worked, a Sweepstakes map: framed on the sections, the worked ones shaded. */
export function contestMapScene(e: PanelEnvironment, shown: Shown[], dots: Dot[], counts: number[], home: Place | undefined, view: View, spotted: Spotted = { dots: [], counts: [] }, sections?: string[], settings: MapSettings = mapSettings({}), hover?: Hover): PanelScene {
  const t = words(e.locale), c = e.colors
  const width = Math.max(1, Math.min(8192, e.width)), height = Math.max(1, Math.min(8192, e.height))
  const layers: PanelSceneLayer[] = [{ id: 'fill', x: 0, y: 0, width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${rgbOf(c.surface)}"/></svg>` }]

  // The operator's view, else the sections in Sweepstakes, else the whole world round the station.
  const frame = sections ? fitView(SECTIONS_FRAME, width, height) : undefined
  const dark = e.brightness === 'dark', palette = settings.palette ?? 'color', rings = settings.rings
  const wanted = dark ? WANTED.dark : WANTED.light
  const worked = new Set(sections ?? []), spottedSections = sections ? (spotted.sections ?? []).filter(s => !worked.has(s)) : []
  // Shaded as the land the map draws at this zoom, its 1:110m or 1:50m.
  const zoom = mapZoom(e, view, !!sections), side = Math.min(width, height), scale = scaleFor(zoom)
  const images = [
    ...(sections?.length ? [{ id: 'worked', image: shadingImage(sections, landIn(palette, dark), scale), bounds: SHADING_BOUNDS, opacity: 1 }] : []),
    ...(spottedSections.length ? [{ id: 'spotted', image: shadingImage(spottedSections, wanted.color, scale), bounds: SHADING_BOUNDS, opacity: wanted.opacity }] : []),
  ]
  const outlines = dark ? OUTLINES.dark : OUTLINES.light
  const hovered = sections && hover ? hoverParts(e, hover) : undefined
  const middle = finite(view.lat) && finite(view.lon) ? { lat: view.lat, lon: view.lon } : frame ? { lat: frame.lat, lon: frame.lon } : home
  // A place's contacts fanned out in the middle, newest first, and its spotted stations round them,
  // drawn over them: small enough to hide little, and not hidden under the contacts.
  const spread = spreadStacks([...spotted.dots, ...dots], zoom, side)
  const spots = spread.slice(0, spotted.dots.length), contacts = spread.slice(spotted.dots.length)
  const markers: PanelSceneMapMarker[] = [
    ...(home ? [{ id: 'home', lat: home.lat, lon: home.lon, style: 'home' }] : []),
    ...contacts.map(dot => {
      const opacity = 1 - (1 - OLDEST_OPACITY) * Math.min(1, dot.ageMillis / HOUR)
      return { id: dot.id, lat: dot.lat, lon: dot.lon, style: dot.newest ? 'newest' : 'qso', fill: withAlpha(bandColor(dot.band), opacity), color: withAlpha('#FFFFFF', opacity) }
    }),
    ...spots.map(dot => ({ id: dot.id, lat: dot.lat, lon: dot.lon, style: 'spot', fill: withAlpha(bandColor(dot.band), 0.9) })),
  ]
  const map: PanelSceneControl = {
    id: 'map', kind: 'map', label: t.map, x: 0, y: 0, width, height, event: 'map',
    // Right over the pane's fill, so the legend drawn after it lies over the map's corner.
    after: 'fill',
    ...(middle ? { home: middle } : {}),
    zoom: { initial: zoom },
    ...(images.length ? { images } : {}),
    // No latitude and longitude lines: the distance rings do their job here.
    map: { graticule: '#00000000', ...outlines, ...(sections ? { land: GRAY_LAND[palette] } : {}), ...(settings.palette ? { palette: settings.palette } : {}), ...(settings.palette === 'teal' ? { sea: TEAL.surface } : {}), ...(settings.grayline ? {} : { grayline: false }) },
    styles: {
      qso: { radius: QSO_RADIUS, width: 1 },
      spot: { radius: SPOT_RADIUS, color: withAlpha('#FFFFFF', 0.85), width: 0.5 },
      newest: { radius: [[0, 6], [6, 10]], width: 2 },
      home: { fill: '#212121', color: '#FFFFFF', radius: [[0, 4], [6, 6]], width: 2 },
      // Showing as the app's lines between states do, from zoom 1.3 to 2, dashed to tell them apart.
      section: { color: withAlpha(c.outline, 0.7), width: [[1.3, 0], [2, 0.8]], dashed: true },
      ring: { color: withAlpha(c.onSurfaceVariant, 0.45), width: 0.8 },
      hover: { color: dark ? '#FFFFFFFF' : '#FF111111', width: 2.5, casing: dark ? '#B3000000' : '#B3FFFFFF' },
    },
    // Rings out from the station at the step chosen, as far as the far side of the Earth.
    ...(home && rings ? { circles: Array.from({ length: Math.min(256, Math.floor(HALF_EARTH_KM / rings.km)) }, (_, i) => ({ id: `ring-${i + 1}`, style: 'ring', at: home, km: (i + 1) * rings.km, label: { unit: rings.unit, size: 10, color: c.onSurfaceVariant } })) } : {}),
    lines: [...SECTION_LINES.map((line, i) => ({ id: `section-${i}`, style: 'section', points: pairs(line) })), ...(hovered?.lines ?? [])],
    markers,
  }

  // The legend: each band shown, in its colour, with the radios on it under SO2R, how many contacts it had in the hour, and
  // how many stations not yet worked are spotted on it. Kept quiet, small faint text over the panel's background let through, so the map
  // stays the thing to look at.
  const style = e.typography.label, size = style.fontSize * LEGEND_SCALE, scaled = style.scaledFontSize * LEGEND_SCALE
  const line = Math.ceil(scaled * style.lineHeight) + 2
  const so2r = shown.some(s => s.sets.includes('B'))
  const rows = shown.length
    ? shown.map((s, i) => ({ text: `${so2r ? `${s.sets.join('+')} ` : ''}${s.band} · ${t.count(counts[i])}${spotted.counts[i] ? ` · ${t.spots(spotted.counts[i])}` : ''}`, color: bandColor(s.band) }))
    : [{ text: t.noBand, color: c.onSurfaceVariant }]
  const charWidth = scaled * 0.6, pad = 5, dot = 6
  const boxW = Math.min(width - 12, Math.ceil(Math.max(...rows.map(r => r.text.length)) * charWidth) + dot + pad * 3)
  const boxH = rows.length * line + pad
  if (boxW > 40 && boxH < height - 12) {
    let art = `<rect x="0" y="0" width="${boxW}" height="${boxH}" rx="4" fill="${rgbOf(c.surface)}" fill-opacity="0.6"/>`
    rows.forEach((row, i) => { art += `<circle cx="${pad + dot / 2}" cy="${pad / 2 + i * line + line / 2}" r="${dot / 2}" fill="${rgbOf(row.color)}"/>` })
    layers.push({ id: 'legend-box', x: 6, y: 6, width: boxW, height: boxH, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boxW} ${boxH}">${art}</svg>` })
    rows.forEach((row, i) => layers.push({
      id: `legend-${i}`, x: 6 + pad * 2 + dot, y: 6 + pad / 2 + i * line + 1, width: boxW - pad * 3 - dot, height: line - 1,
      text: { literal: row.text, size, fontFamily: style.fontFamily ?? undefined, fontWeight: 400, lineHeight: style.lineHeight, color: c.onSurfaceVariant },
    }))
  }
  // In Sweepstakes the app tells of a pointer resting on the map (API 28): its section, outlined and named.
  if (sections) Object.assign(map, { dwell: DWELL_MS })
  layers.push(...(hovered?.layers ?? []))
  return { version: 1, width, height, values: {}, layers, controls: [map] }
}

export function createContestMap(host: ContestMapHost): PanelHook {
  /** Where the operator left each placement's view: given back so a render does not move it. */
  const views = new Map<string, View>()
  /** The section a pointer rests on in each placement, until it moves on. */
  const hovers = new Map<string, Hover>()
  return {
    async getPanels(_args, ctx) {
      const t = words(ctx.locale)
      return [{ key: 'contest-map', title: t.title, description: t.description, icon: 'map-marker-multiple', multiple: true, on: ['qsoLogged', 'radio', 'qso', 'operation', 'spots', 'tick:60'], form: settingsForm(ctx.locale) }]
    },
    async render(args, ctx) {
      const t = words(args.environment?.locale ?? ctx.locale)
      if (!args.environment || !args.clock) return { kind: 'markdown', content: t.update }
      if (!ctx.getQsos) return { kind: 'markdown', content: t.noLog }
      const qsos = await ctx.getQsos(String(args.operation.uuid ?? ''))
      if (qsos === null) return { kind: 'markdown', content: t.noLog }
      // A read that fails shows the map as with no radio, and says why in the log.
      const failed = (what: string) => (error: unknown) => { host.log?.(`${what} failed: ${error instanceof Error ? error.message : String(error)}`); return null }
      const [radioA, radioB] = await Promise.all([host.readRadio('A').catch(failed('Reading Radio A')), host.readRadio('B').catch(failed('Reading Radio B'))])
      const shown = shownBands(radioA, radioB, args.qso, qsos as Qso[])
      const { dots, counts } = dotsFor(qsos as Qso[], shown, args.clock.nowMillis)
      const grid = args.operation.grid
      const home = real(grid) ? fromGrid(grid) : undefined
      const spots = shown.length && ctx.getSpots
        // Each source's report, not the Spots panel's rows, which merge several stations into one.
        ? (await ctx.getSpots({ filter: 'sources', band: shown.map(s => s.band), maxAgeMinutes: SPOT_MAX_AGE_MINUTES }).catch(failed('Reading the spots'))) ?? []
        : []
      const spotted = spotDotsFor(spots, shown, args.clock.nowMillis)
      const sections = isSweepstakes(args.operation) ? workedSections(qsos as Qso[]) : undefined
      const key = args.instanceId ?? ''
      const scene = contestMapScene(args.environment, shown, dots, counts, home, views.get(key) ?? {}, spotted, sections, mapSettings(args.config), hovers.get(key))
      return { kind: 'scene', scene }
    },
    async onEvent(args) {
      const { event } = args, key = args.instanceId ?? ''
      if (event.action === 'map') {
        // A pointer resting on the map, and moving on (API 28, which the SDK's types here predate).
        const gesture = event.gesture as string | undefined
        if (gesture === 'dwell' || gesture === 'dwellEnd') {
          const before = hovers.get(key), at = event.at
          hovers.delete(key)
          const patch: PanelScenePatch = before ? hoverRemoval(before) : []
          // The section shaded under the pointer at this zoom: none on the water the map draws.
          const scale = args.environment && scaleFor(mapZoom(args.environment, views.get(key) ?? {}, true))
          const section = gesture === 'dwell' && scale && finite(at?.lat) && finite(at?.lon) && finite(at?.x) && finite(at?.y) ? shadedSectionAt(at.lat, at.lon, scale) : undefined
          if (section && args.environment && at) {
            const hover = { section, x: at.x, y: at.y }
            hovers.set(key, hover)
            const { lines, layers } = hoverParts(args.environment, hover)
            // As JSON, which a patch carries: the scene's own types have no index signature.
            const json = (item: object) => item as { id: string; [key: string]: JSONValue }
            patch.push(...lines.map(value => ({ insert: ['controls', 'map', 'lines'], value: json(value) })), ...layers.map(value => ({ insert: ['layers'], value: json(value) })))
          }
          return patch.length ? { values: {}, patch } : { values: {} }
        }
        const view = views.get(key) ?? {}
        if (event.gesture === 'reset') views.delete(key)
        else if (event.gesture === 'zoom' && finite(event.value)) views.set(key, { ...view, zoom: event.value })
        else if (event.gesture === 'pan' && finite(event.at?.lat) && finite(event.at?.lon)) views.set(key, { ...view, lat: event.at.lat, lon: event.at.lon })
      }
      return { values: {} }
    },
  }
}
