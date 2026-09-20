// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PanelEnvironment, PanelRenderArgs, HookContext } from '@ham2k/extension-sdk'
import { createWeatherPanel, weatherLocation } from './weather.ts'
import { icons, weatherIcon } from './icons.ts'

const style = { fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji'], fontSize: 14, scaledFontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
const environment: PanelEnvironment = {
  version: 1, width: 440, height: 380, safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
  brightness: 'dark', colors: {
    surface: '#101010', surfaceContainer: '#202020', onSurface: '#eeeeee', onSurfaceVariant: '#bbbbbb',
    accent: '#00ffff', primary: '#00cccc', onPrimary: '#000000', secondary: '#ff00ff',
    outline: '#aaaaaa', outlineVariant: '#555555', error: '#ff0000', onError: '#ffffff',
  },
  typography: { body: style, label: style, title: style, display: { ...style, fontSize: 36, scaledFontSize: 36 }, mono: { ...style, fontFamily: 'RobotoMono' } },
  locale: 'en', textDirection: 'ltr', devicePixelRatio: 2, reducedMotion: false, highContrast: false,
}
const now = Date.UTC(2026, 8, 17, 12)
const args: PanelRenderArgs = { panelKey: 'weather', operation: { grid: 'FN42' }, qsoCount: 0, config: {}, reason: 'initial', environment, clock: { nowMillis: now, realNowMillis: now } }
const ctx: HookContext = { online: true, locale: 'en', distanceUnits: 'kilometers' }
function payload() {
  return { utc_offset_seconds: 20700, timezone_abbreviation: '+0545',
    current: { temperature_2m: 24, weather_code: 2 }, current_units: { temperature_2m: '°C' },
    hourly: { time: Array.from({ length: 8 }, (_, i) => now / 1000 + i * 3600), temperature_2m: [24, 25, null, 25, 23, 22, 21, 20], precipitation_probability: [0, 20, null, 80, 50, 20, 10, 0] },
  }
}

test('theme and resize rerenders use cached weather and resolved typography', async () => {
  const urls: string[] = []
  const panel = createWeatherPanel(async url => { urls.push(url); return { status: 200, body: JSON.stringify(payload()) } })
  const first = await panel.render(args, ctx)
  const second = await panel.render({ ...args, reason: 'environment', environment: { ...environment, width: 700, brightness: 'light', colors: { ...environment.colors, accent: '#cc1100' } } }, ctx)
  assert.equal(urls.length, 1)
  assert.match(urls[0], /temperature_unit=celsius/)
  assert.equal(first.kind, 'svgScene'); assert.equal(second.kind, 'svgScene')
  if (first.kind !== 'svgScene' || second.kind !== 'svgScene') return
  assert.equal(second.scene.width, 700)
  assert.match(second.scene.layers.find(l => l.id === 'chart')!.svg!, /#cc1100/)
  assert.equal(second.scene.layers.find(l => l.id === 'temperature')!.text!.fontFamily, 'Roboto')
  assert.equal(second.scene.controls![0].event, undefined)
  assert.match(String(first.scene.layers.find(l => l.id === 'inspection')!.text!.samples![2]), /19:45.*—°C/)
  assert.match(String(first.scene.layers.find(l => l.id === 'inspection-rain')!.text!.samples![2]), /—%/)
  const marker = first.scene.layers.find(l => l.id === 'selected-point')!
  assert.equal(marker.opacity!.samples![2], 0, 'missing readings must not imply a measured point')
  assert.ok(marker.translateY!.samples![1] < marker.translateY!.samples![0], 'warmer readings appear higher')
  const callout = first.scene.layers.find(l => l.id === 'inspection-background')!
  for (const x of callout.translateX!.samples!) {
    assert.ok(x >= 0 && x + callout.width <= first.scene.width, 'edge-hour readouts stay inside the pane')
  }
})

test('a failed refresh retains readings, reports staleness, and limits retries in real time', async () => {
  let calls = 0
  const panel = createWeatherPanel(async () => ++calls === 1 ? { status: 200, body: JSON.stringify(payload()) } : { status: 503, body: '' })
  await panel.render(args, ctx)
  const later = { ...args, clock: { nowMillis: now + 900000, realNowMillis: now + 900000 } }
  const stale = await panel.render(later, ctx)
  assert.equal(stale.kind, 'svgScene')
  if (stale.kind === 'svgScene') assert.match(stale.scene.layers.find(l => l.id === 'source')!.text!.literal!, /Refresh failed/)
  await panel.render({ ...later, clock: { nowMillis: now + 86400000, realNowMillis: now + 901000 } }, ctx)
  assert.equal(calls, 2, 'travelling the display clock must not spend another network request')
})

test('location and units isolate the cache; exact operation coordinates outrank its grid', async () => {
  assert.deepEqual(weatherLocation({ ...args, operation: { lat: 40, lon: -73, grid: 'AA00' } }), [40, -73])
  assert.deepEqual(weatherLocation({ ...args, config: { location: '51.5,-0.1' } }), [51.5, -.1])
  for (const location of ['91,0', '0,181', 'NaN,0', ',0', 'not a place']) assert.equal(weatherLocation({ ...args, config: { location } }), null)
  const urls: string[] = []
  const panel = createWeatherPanel(async url => { urls.push(url); return { status: 200, body: JSON.stringify(payload()) } })
  await panel.render(args, ctx)
  await panel.render(args, { ...ctx, distanceUnits: 'miles' })
  await panel.render({ ...args, config: { location: '51.5,-0.1' } }, ctx)
  assert.equal(urls.length, 3)
  assert.match(urls[1], /temperature_unit=fahrenheit/)
  assert.match(urls[2], /latitude=51.5/)
})

test('concurrent placements share an in-flight fetch', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const panel = createWeatherPanel(async () => { calls++; await gate; return { status: 200, body: JSON.stringify(payload()) } })
  const a = panel.render(args, ctx), b = panel.render({ ...args, instanceId: 'second' }, ctx)
  release()
  await Promise.all([a, b])
  assert.equal(calls, 1)
})

test('condition icons distinguish daytime, night, mixed precipitation and unknown readings', async () => {
  assert.equal(weatherIcon(0, true), 'weather-sunny')
  assert.equal(weatherIcon(0, false), 'weather-night')
  assert.equal(weatherIcon(2, false), 'weather-night-partly-cloudy')
  assert.equal(weatherIcon(67, true), 'weather-snowy-rainy')
  assert.equal(weatherIcon(99, true), 'weather-hail')
  assert.equal(weatherIcon(null, true), 'weather-cloudy-alert')
  const data = { ...payload(), current: { temperature_2m: 20, weather_code: 0, is_day: 0 },
    hourly: { ...payload().hourly, weather_code: [0, 2, 3, 61, 73, 95, 99, null], is_day: [0, 0, 0, 0, 0, 0, 0, 0] } }
  const panel = createWeatherPanel(async url => {
    assert.match(url, /weather_code,is_day/)
    return { status: 200, body: JSON.stringify(data) }
  })
  const result = await panel.render(args, ctx)
  assert.equal(result.kind, 'svgScene')
  if (result.kind !== 'svgScene') return
  assert.ok(result.scene.layers.find(l => l.id === 'condition-icon')!.svg!.includes(icons['weather-night']))
  assert.ok(result.scene.layers.find(l => l.id === 'hour-icon-1')!.svg!.includes(icons['weather-night-partly-cloudy']))
  assert.equal(result.scene.layers.filter(l => l.id.startsWith('hour-icon-')).length, 8)
})

test('missing data, localization, small panes and large text produce bounded documents', async () => {
  const data = payload(); data.hourly.temperature_2m.fill(null)
  const panel = createWeatherPanel(async () => ({ status: 200, body: JSON.stringify(data) }))
  for (const [width, height] of [[1, 1], [60, 45], [150, 180], [440, 500]]) {
    const typography = Object.fromEntries(Object.entries(environment.typography).map(([key, value]) => [key, { ...value, scaledFontSize: value.fontSize * 2 }])) as PanelEnvironment['typography']
    const result = await panel.render({ ...args, environment: { ...environment, width, height, locale: 'es', typography } }, ctx)
    assert.equal(result.kind, 'svgScene')
    if (result.kind !== 'svgScene') continue
    for (const layer of result.scene.layers) {
      assert.ok(layer.width >= 1 && layer.height >= 1)
      assert.ok(!/NaN|Infinity/.test(layer.svg ?? ''))
    }
    if (height === 500) assert.match(result.scene.layers.find(l => l.id === 'condition')!.text!.literal!, /nublado/)
  }
})
