// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PanelEnvironment, PanelRenderArgs, HookContext } from '@ham2k/extension-sdk'
import { createSolarPanel, parseConditions, parseSeries, mergePoints, windBuckets, urls } from './solar.ts'

const style = { fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji'], fontSize: 14, scaledFontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
const environment: PanelEnvironment = {
  version: 1, width: 440, height: 650, safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
  brightness: 'dark', colors: {
    surface: '#101010', surfaceContainer: '#202020', onSurface: '#eeeeee', onSurfaceVariant: '#bbbbbb',
    accent: '#00ffff', primary: '#00cccc', onPrimary: '#000000', secondary: '#ff00ff',
    outline: '#aaaaaa', outlineVariant: '#555555', error: '#ff0000', onError: '#ffffff',
  },
  typography: { body: style, label: style, title: style, display: { ...style, fontSize: 36, scaledFontSize: 36 }, mono: { ...style, fontFamily: 'RobotoMono' } },
  locale: 'en', textDirection: 'ltr', devicePixelRatio: 2, reducedMotion: false, highContrast: false,
}
const now = Date.UTC(2026, 8, 17, 12)
const args: PanelRenderArgs = { panelKey: 'solar', operation: { grid: 'FN42' }, qsoCount: 0, config: {}, reason: 'initial', environment, clock: { nowMillis: now, realNowMillis: now } }
const ctx: HookContext = { online: true, locale: 'en', distanceUnits: 'kilometers' }

const xml = '<solar><solarflux>132</solarflux><sunspots>83</sunspots><aindex>6</aindex><kindex>2</kindex><solarwind>410.5</solarwind><band time="night" name="80m-40m">Good</band><band name="80m-40m" time="day">Fair</band><band name="20m" time="day">NoRpt</band></solar>'
const stamps = [now - 6 * 3600000, now - 3 * 3600000, now]
const utc = (time: number) => new Date(time).toISOString().replace('Z', '')
const bodies = {
  [urls.conditions]: xml,
  [urls.flux]: JSON.stringify(stamps.map((time, i) => ({ time_tag: utc(time), flux: 130 + i }))),
  [urls.kp]: JSON.stringify([['time_tag', 'Kp'], ...stamps.map((time, i) => [utc(time), String(i + 1)])]),
  [urls.wind]: JSON.stringify([['time_tag', 'speed'], ...stamps.map((time, i) => [utc(time), 400 + i * 20])]),
  [urls.history]: JSON.stringify([['time_tag', 'speed'], ...stamps.map((time, i) => [utc(time), 390 + i * 20])]),
}

test('parses band pairs, missing indices, UTC tables and object series without inventing zeroes', () => {
  const r = parseConditions(xml)
  assert.deepEqual(r.bands, [{ name: '80m-40m', day: 'fair', night: 'good' }, { name: '20m', day: 'unknown', night: 'unknown' }])
  assert.throws(() => parseConditions('<html>Unavailable</html>'))
  assert.equal(parseConditions('<solarflux>100</solarflux>').a, null)
  const kp = parseSeries(bodies[urls.kp], 'Kp')
  assert.deepEqual(kp.map(p => p.time), stamps)
  assert.deepEqual(kp.map(p => p.value), [1, 2, 3])
  assert.deepEqual(parseSeries(JSON.stringify([['speed', 'time_tag'], [null, utc(now)], ['420', utc(now - 1)]]), 'speed'), [{ time: now - 1, value: 420 }])
  assert.throws(() => parseSeries('[{"time_tag":"bad","flux":0}]', 'flux'))
  assert.throws(() => parseSeries('[{"time_tag":"2026-09-17T12:00:00","Kp":null}]', 'Kp'))
})

test('wind merging prefers recent readings and averages UTC three-hour buckets', () => {
  const points = mergePoints([{ time: now, value: 100 }], [{ time: now, value: 400 }, { time: now + 60000, value: 600 }])
  assert.deepEqual(windBuckets(points), [{ time: now, value: 500 }])
})

test('shared cache deduplicates placements and keeps resize/theme/inspection network-free', async () => {
  const calls: string[] = []
  const panel = createSolarPanel(async url => { calls.push(url); return { status: 200, body: bodies[url] } })
  const [a, b] = await Promise.all([panel.render(args, ctx), panel.render({ ...args, instanceId: 'two' }, ctx)])
  assert.equal(a.kind, 'svgScene'); assert.equal(b.kind, 'svgScene'); assert.equal(calls.length, 5)
  const next = await panel.render({ ...args, environment: { ...environment, brightness: 'light', colors: { ...environment.colors, accent: '#cc1100' } } }, ctx)
  assert.equal(calls.length, 5)
  if (next.kind !== 'svgScene') return
  assert.match(next.scene.layers.find(l => l.id === 'flux-chart')!.svg!, /#cc1100/)
  assert.equal(next.scene.controls![0].event, undefined)
  assert.equal(next.scene.controls![0].valueLabels!.length, 57)
  assert.equal(next.scene.layers.filter(l => l.id.endsWith('-chart')).length, 3)
  assert.equal(next.scene.layers.find(l => l.id === 'sfi')!.text!.fontFamily, 'Roboto')
  await panel.render({ ...args, clock: { nowMillis: now + 900000, realNowMillis: now + 900000 } }, ctx)
  assert.equal(calls.length, 9, 'large wind history is not fetched on every refresh')
})

test('partial NOAA failures keep good charts; primary failure marks cached indices and rate-limits retries', async () => {
  let fail = false, calls = 0
  const panel = createSolarPanel(async url => { calls++; return { status: fail ? 503 : 200, body: bodies[url] } })
  await panel.render(args, ctx); fail = true
  const stale = await panel.render({ ...args, clock: { nowMillis: now + 900000, realNowMillis: now + 900000 } }, ctx)
  assert.equal(stale.kind, 'svgScene')
  if (stale.kind !== 'svgScene') return
  assert.match(stale.scene.layers.find(l => l.id === 'source')!.text!.literal!, /Refresh failed/)
  assert.equal(stale.scene.layers.filter(l => l.id.endsWith('-chart')).length, 3)
  assert.match(stale.scene.layers.find(l => l.id === 'kp-caption')!.text!.samples![56] as string, /Refresh failed/)
  const count = calls
  await panel.render({ ...args, clock: { nowMillis: now + 86400000, realNowMillis: now + 901000 } }, ctx)
  assert.equal(calls, count)
  const partial = createSolarPanel(async url => ({ status: url === urls.flux ? 500 : 200, body: bodies[url] }))
  const p = await partial.render(args, ctx)
  assert.equal(p.kind, 'svgScene')
  if (p.kind === 'svgScene') assert.deepEqual(p.scene.layers.filter(l => l.id.endsWith('-chart')).map(l => l.id), ['wind-chart', 'kp-chart'])
})

test('compact, large-text and Spanish layouts remain bounded and omit unreadable charts', async () => {
  const panel = createSolarPanel(async url => ({ status: 200, body: bodies[url] }))
  for (const [width, height] of [[1, 1], [90, 70], [220, 140], [450, 700]]) {
    const typography = Object.fromEntries(Object.entries(environment.typography).map(([k, s]) => [k, { ...s, scaledFontSize: s.fontSize * 2 }])) as PanelEnvironment['typography']
    const r = await panel.render({ ...args, environment: { ...environment, width, height, typography, locale: 'es' } }, ctx)
    assert.equal(r.kind, 'svgScene')
    if (r.kind !== 'svgScene') continue
    for (const layer of r.scene.layers) {
      assert.ok(layer.width >= 1 && layer.height >= 1)
      assert.ok(!/NaN|Infinity/.test(layer.svg ?? ''))
    }
    if (height === 700) assert.ok(r.scene.layers.some(l => l.text?.literal === 'Día'))
  }
})

test('the right edge inspects the newest measurement between three-hour boundaries', async () => {
  const later = now + 3600000
  const panel = createSolarPanel(async url => ({ status: 200, body: url === urls.flux
    ? JSON.stringify([{ time_tag: utc(now), flux: 130 }, { time_tag: utc(later), flux: 140 }]) : bodies[url] }))
  const r = await panel.render({ ...args, clock: { nowMillis: later, realNowMillis: later } }, ctx)
  assert.equal(r.kind, 'svgScene')
  if (r.kind === 'svgScene') assert.match(r.scene.layers.find(l => l.id === 'flux-caption')!.text!.samples![56] as string, /SFI 140.*13:00Z/)
})
