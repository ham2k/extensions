// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bandColor, createContestMap, dotsFor, qsoPlace, shownBands, spotDotsFor, spreadStacks, withAlpha, workedSections } from './contestmap.ts'

const NOW = 1_800_000_000_000
const MIN = 60_000
const colors: Record<string, string> = {}
for (const k of ['surface', 'surfaceContainer', 'onSurface', 'onSurfaceVariant', 'accent', 'primary', 'outline', 'outlineVariant']) colors[k] = '#123456'
const label = { fontSize: 12, scaledFontSize: 12, lineHeight: 1.2, fontWeight: 400 }
const env = { version: 1, width: 800, height: 400, brightness: 'light', safeInsets: { left: 0, top: 0, right: 0, bottom: 0 }, colors, typography: { label, title: label } }
const radio = (frequencyHz: number | null) => ({ frequencyHz }) as any
const qso = (minutesAgo: number, band: string, their: Record<string, unknown>): any => ({ startAtMillis: NOW - minutesAgo * MIN, band, their })

test('a dot goes where the log knows the station best', () => {
  assert.deepEqual(qsoPlace({ their: { lat: 10, lon: 20, grid: 'FN30' } }), { lat: 10, lon: 20 })
  assert.deepEqual(qsoPlace({ their: { grid: 'FN30', guess: { lat: 1, lon: 2 } } }), { lat: 40.5, lon: -73 })
  assert.deepEqual(qsoPlace({ their: { guess: { lat: 1, lon: 2, grid: 'FN30' } } }), { lat: 1, lon: 2 })
  assert.deepEqual(qsoPlace({ their: { guess: { entityPrefix: 'JA' } } }), { lat: 36.3, lon: 138.8 })
  assert.deepEqual(qsoPlace({ their: { call: 'N5TJ', state: 'TX' } }), { lat: 31.9, lon: -99.4 })
  assert.equal(qsoPlace({ their: {} }), undefined)
  // A grid that gives no place leaves the dot to what else the log knows.
  assert.deepEqual(qsoPlace({ their: { grid: 'FN31P', guess: { lat: 1, lon: 2 } } }), { lat: 1, lon: 2 })
  assert.deepEqual(qsoPlace({ their: { grid: 'XX99', call: 'N5TJ', state: 'TX' } }), { lat: 31.9, lon: -99.4 })
})

test('each radio shows its own band, and two on one band show it once', () => {
  assert.deepEqual(shownBands(radio(14025000), radio(7030000), undefined, []), [{ band: '20m', sets: ['A'] }, { band: '40m', sets: ['B'] }])
  assert.deepEqual(shownBands(radio(14025000), radio(14250000), undefined, []), [{ band: '20m', sets: ['A', 'B'] }])
  assert.deepEqual(shownBands(radio(14025000), radio(null), undefined, []), [{ band: '20m', sets: ['A'] }])
})

test('with no radio, the logging fields’ band, then the latest contact’s', () => {
  assert.deepEqual(shownBands(null, null, { band: '40m' }, []), [{ band: '40m', sets: ['A'] }])
  assert.deepEqual(shownBands(radio(null), null, {}, [{ band: '20m' }, { band: '15m' }, { band: 'event' }]), [{ band: '15m', sets: ['A'] }])
  assert.deepEqual(shownBands(null, null, undefined, []), [])
})

test('only the last hour’s contacts on the bands shown, oldest first, the newest marked', () => {
  const qsos = [
    qso(90, '20m', { grid: 'IO91' }), // too old
    qso(50, '20m', { grid: 'JO62' }),
    qso(30, '40m', { grid: 'PM95' }),
    qso(10, '20m', { grid: 'CM87' }),
    qso(5, '15m', { grid: 'FN31' }), // another band
    qso(2, '40m', {}), // counted, but nowhere to put it
  ]
  const { dots, counts } = dotsFor(qsos, [{ band: '20m', sets: ['A'] }, { band: '40m', sets: ['B'] }], NOW)
  assert.deepEqual(counts, [2, 2])
  assert.deepEqual(dots.map(d => [d.id, d.band, d.newest]), [['q1', '20m', false], ['q2', '40m', true], ['q3', '20m', true]])
})

test('dots at one place fan out round it, the newest in the middle, a few pixels apart', () => {
  const dot = (id: string, lat = 43, lon = -75) => ({ id, lat, lon, band: '20m', ageMillis: 0, newest: false })
  const dots = [dot('q0'), dot('q1'), dot('q2'), dot('q3', 30, -90)]
  const [a, b, c, alone] = spreadStacks(dots, 0, 360) // one degree of longitude a pixel, at zoom 0
  assert.deepEqual([c, alone], [dots[2], dots[3]])
  const px = (p: { lat: number; lon: number }) => Math.hypot(p.lon - c.lon, (p.lat - c.lat) / Math.cos(43 * Math.PI / 180))
  for (const moved of [a, b]) assert.ok(px(moved) > 2 && px(moved) < 6, `${px(moved)}`)
  assert.ok(Math.hypot(a.lon - b.lon, a.lat - b.lat) > 2)
  // Closer in, the same pixels are less of the Earth.
  assert.ok(Math.abs(spreadStacks(dots, 4, 360)[1].lon - c.lon) < Math.abs(b.lon - c.lon) / 8)
})

test('the stations spotted on the bands shown and not worked yet, once each', () => {
  const spot = (call: string, minutesAgo: number, band: string, annotations = {}, their = {}): any =>
    ({ their: { call, ...their }, band, spot: { timeInMillis: NOW - minutesAgo * MIN, source: 'cluster' }, annotations: { worked: false, isSelf: false, notices: [], ...annotations } })
  const spots = [
    spot('W1AW', 3, '20m', {}, { guess: { state: 'CT' } }),
    spot('W1AW', 1, '20m'), // the same station again: one dot, the latest
    spot('K3LR', 2, '40m'),
    spot('N5TJ', 4, '20m', { worked: true }), // in the log
    spot('KI2D', 4, '20m', { isSelf: true }),
    spot('VE3XX', 45, '20m'), // too old
    spot('JA1ABC', 5, '15m'), // another band
  ]
  const { dots, counts } = spotDotsFor(spots, [{ band: '20m', sets: ['A'] }, { band: '40m', sets: ['B'] }], NOW)
  assert.deepEqual(counts, [1, 1])
  assert.deepEqual(dots.map(d => [d.band, Math.round(d.ageMillis / MIN)]), [['40m', 2], ['20m', 1]])
})

test('colors take an opacity as #AARRGGBB', () => {
  assert.equal(withAlpha('#ff4400', 1), '#FFFF4400')
  assert.equal(withAlpha('#80123456', 0), '#00123456')
})

test('the panel draws a map with the dots and a legend, under SO2R', async () => {
  const host = { readRadio: async (id?: string) => radio(id === 'B' ? 7030000 : 14025000) }
  const hook = createContestMap(host)
  const qsos = [qso(40, '20m', { grid: 'JO62' }), qso(1, '40m', { grid: 'PM95' })]
  const asked: any[] = []
  const content: any = await hook.render(
    { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'a', panelKey: 'contest-map', operation: { uuid: 'op', grid: 'FN30' }, qsoCount: 2, config: {}, reason: 'test' } as any,
    { online: true, getQsos: async () => qsos, getSpots: async (options: any) => (asked.push(options), [{ their: { call: 'K3LR' }, band: '40m', spot: { timeInMillis: NOW - MIN, source: 'cluster' }, annotations: { worked: false, isSelf: false, notices: [] } }]) } as any,
  )
  assert.equal(asked[0].filter, 'sources', 'one station a spot, not the Spots panel\'s merged rows')
  const map = content.scene.controls.find((c: any) => c.kind === 'map')
  assert.equal(map.markers[0].id, 'home')
  assert.deepEqual(map.home, { lat: 40.5, lon: -73 })
  assert.equal(map.markers.length, 4)
  assert.ok(map.markers[1].fill.endsWith(bandColor('20m').slice(1)))
  assert.ok(map.markers[2].fill.endsWith(bandColor('40m').slice(1)))
  const legend = content.scene.layers.filter((l: any) => l.text).map((l: any) => l.text.literal)
  assert.deepEqual(legend, ['A 20m · 1 QSO', 'B 40m · 1 QSO · 1 spot'])
  assert.deepEqual(map.markers.filter((m: any) => m.style === 'spot').map((m: any) => m.fill), [`#E6${bandColor('40m').slice(1)}`])
})

test('the operator’s view is given back until a reset', async () => {
  const hook = createContestMap({ readRadio: async () => radio(14025000) })
  const args = { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'a', panelKey: 'contest-map', operation: { uuid: 'op' }, qsoCount: 0, config: {}, reason: 'test' } as any
  const ctx = { online: true, getQsos: async () => [] } as any
  const mapOf = async () => ((await hook.render(args, ctx)) as any).scene.controls[0]
  await hook.onEvent!({ ...args, event: { action: 'map', phase: 'commit', gesture: 'zoom', value: 3 } }, ctx)
  await hook.onEvent!({ ...args, event: { action: 'map', phase: 'commit', gesture: 'pan', at: { x: 0, y: 0, lat: 50, lon: 10 } } }, ctx)
  assert.deepEqual([(await mapOf()).zoom.initial, (await mapOf()).home], [3, { lat: 50, lon: 10 }])
  await hook.onEvent!({ ...args, event: { action: 'map', phase: 'commit', gesture: 'reset' } }, ctx)
  assert.deepEqual([(await mapOf()).zoom.initial, (await mapOf()).home], [0, undefined])
})


test('in Sweepstakes the map starts on the sections, the ones worked shaded', async () => {
  const hook = createContestMap({ readRadio: async () => radio(3800000) })
  const qsos = [qso(300, '80m', { call: 'N5TJ', arrlSection: 'STX' }), qso(5, '80m', { call: 'W1AW', arrlSection: 'ct' })]
  const render = async (operation: any) => ((await hook.render(
    { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'ss', panelKey: 'contest-map', operation, qsoCount: 2, config: {}, reason: 'test' } as any,
    { online: true, getQsos: async () => qsos } as any,
  )) as any).scene.controls[0]
  const ss = await render({ uuid: 'op', grid: 'FN30', refs: [{ type: 'arrl-ss' }] })
  assert.ok(ss.zoom.initial > 2 && ss.zoom.initial < 3, `${ss.zoom.initial}`)
  assert.ok(ss.home.lat > 38 && ss.home.lat < 44 && ss.home.lon > -95 && ss.home.lon < -88, JSON.stringify(ss.home))
  assert.equal(ss.images.length, 1)
  assert.match(ss.images[0].image, /^data:image\/png;base64,/)
  // The land gray, the worked sections painted back in the palette's own land colour.
  assert.deepEqual([ss.map.land, ss.images[0].opacity], ['#B8B8B8', 1])
  assert.deepEqual(workedSections(qsos), ['STX', 'CT'])
  // Any other operation: the whole world round the station, nothing shaded.
  const other = await render({ uuid: 'op', grid: 'FN30' })
  assert.deepEqual([other.zoom.initial, other.home, other.images], [0, { lat: 40.5, lon: -73 }, undefined])
})

test('the placement’s settings: the map’s style, its night, its rings', async () => {
  const hook = createContestMap({ readRadio: async () => radio(14025000) })
  const mapWith = async (config: any) => ((await hook.render(
    { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'cfg', panelKey: 'contest-map', operation: { uuid: 'op', grid: 'FN30' }, qsoCount: 0, config, reason: 'test' } as any,
    { online: true, getQsos: async () => [] } as any,
  )) as any).scene.controls[0]
  const plain = await mapWith({})
  assert.deepEqual(plain.map, { graticule: '#00000000', coast: '#E6202020', borders: '#E6202020', divisions: '#B3303030' })
  assert.deepEqual([plain.circles.length, plain.circles[0].label.unit, plain.circles[0].km], [24, 'mi', 804.672])
  const set = await mapWith({ mapStyle: 'gray', grayline: false, rings: 'off' })
  assert.deepEqual([set.map, set.circles], [{ graticule: '#00000000', coast: '#E6202020', borders: '#E6202020', divisions: '#B3303030', palette: 'gray', grayline: false }, undefined])
  const km = await mapWith({ rings: '1000km' })
  assert.deepEqual([km.circles.length, km.circles[0].label.unit], [20, 'km'])
  const [descriptor] = await hook.getPanels({} as any, { locale: 'es' } as any)
  assert.deepEqual(descriptor.form?.map((f: any) => f.key), ['mapStyle', 'grayline', 'rings'])
})

test('in Sweepstakes a section not worked yet with a station spotted in it lights up', async () => {
  const hook = createContestMap({ readRadio: async () => radio(3800000) })
  const spot = (call: string, their: any) => ({ their: { call, ...their }, band: '80m', spot: { timeInMillis: NOW - 2 * MIN, source: 'cluster' }, annotations: { worked: false, isSelf: false, notices: [] } })
  const map = ((await hook.render(
    { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'hot', panelKey: 'contest-map', operation: { uuid: 'op', grid: 'FN30', refs: [{ type: 'arrl-ss' }] }, qsoCount: 1, config: {}, reason: 'test' } as any,
    { online: true, getQsos: async () => [qso(5, '80m', { call: 'W1AW', arrlSection: 'CT' })], getSpots: async () => [spot('K1XX', { guess: { state: 'CT' } }), spot('N0KS', { guess: { state: 'KS' } })] } as any,
  )) as any).scene.controls[0]
  assert.deepEqual(map.images.map((i: any) => i.id), ['worked', 'spotted'])
  assert.notEqual(map.images[0].image, map.images[1].image)
})

test('a pointer resting on a section outlines it and names it, until it moves on', async () => {
  const hook = createContestMap({ readRadio: async () => radio(3800000) })
  const args = { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'dwell', panelKey: 'contest-map', operation: { uuid: 'op', grid: 'FN30', refs: [{ type: 'arrl-ss' }] }, qsoCount: 0, config: {}, reason: 'test' } as any
  const ctx = { online: true, getQsos: async () => [] } as any
  const scene = async () => ((await hook.render(args, ctx)) as any).scene
  assert.equal((await scene()).controls[0].dwell, 1500)
  const event = (gesture: string, at?: any) => hook.onEvent!({ ...args, event: { action: 'map', phase: 'commit', gesture, at } }, ctx) as Promise<any>
  const rested = await event('dwell', { x: 300, y: 200, lat: 38.5, lon: -98.4 })
  const inserted = rested.patch.map((step: any) => step.value.id)
  assert.ok(inserted.includes('hover-0') && inserted.includes('hover-box'))
  assert.equal(rested.patch.find((step: any) => step.value.id === 'hover-text').value.text.literal, 'KS · Kansas')
  // A render meanwhile keeps it.
  const kept = await scene()
  assert.ok(kept.controls[0].lines.some((l: any) => l.id === 'hover-0') && kept.layers.some((l: any) => l.id === 'hover-text'))
  const ended = await event('dwellEnd')
  assert.deepEqual(ended.patch.map((step: any) => step.remove.at(-1)), [...inserted.filter((id: string) => id.startsWith('hover-') && id !== 'hover-box' && id !== 'hover-text'), 'hover-box', 'hover-text'])
  assert.equal((await scene()).layers.some((l: any) => l.id === 'hover-text'), false)
  // Resting on the sea, nothing.
  assert.equal((await event('dwell', { x: 10, y: 10, lat: 30, lon: -40 })).patch, undefined)
})

test('a radio or the spots failing to answer shows the map without them, and says so in the log', async () => {
  const logged: string[] = []
  const hook = createContestMap({ readRadio: async () => { throw new Error('port closed') }, log: message => logged.push(message) })
  const content: any = await hook.render(
    { environment: env, clock: { nowMillis: NOW, realNowMillis: NOW }, instanceId: 'a', panelKey: 'contest-map', operation: { uuid: 'op', grid: 'FN30' }, qso: { band: '40m' }, qsoCount: 1, config: {}, reason: 'test' } as any,
    { online: true, getQsos: async () => [qso(5, '40m', { grid: 'PM95' })], getSpots: async () => { throw new Error('unknown band') } } as any,
  )
  assert.equal(content.kind, 'scene')
  assert.deepEqual(content.scene.layers.filter((l: any) => l.text).map((l: any) => l.text.literal), ['40m · 1 QSO'])
  assert.deepEqual(logged, ['Reading Radio A failed: port closed', 'Reading Radio B failed: port closed', 'Reading the spots failed: unknown band'])
})
