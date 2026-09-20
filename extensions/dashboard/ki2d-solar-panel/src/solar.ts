// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import type { FetchOptions, FetchResponse, PanelEnvironment, PanelHook, SceneBinding, SvgScene, SvgSceneLayer } from '@ham2k/extension-sdk'
import { solarPalette, solarFluxColor, solarAColor, solarKColor } from './palette.ts'
import { parseSolarXml } from './spaceWeather.ts'

type Fetch = (url: string, options?: FetchOptions) => Promise<FetchResponse>
export type Point = { time: number; value: number }
type Rating = 'good' | 'fair' | 'poor' | 'unknown'
type Conditions = { flux: number; spots: number | null; a: number | null; k: number | null; wind: number | null; bands: { name: string; day: Rating; night: Rating }[] }
type Feed = { points: Point[]; fetched?: number; failed: boolean }
const HOUR = 3600000, WEEK = 7 * 24 * HOUR, BUCKET = 3 * HOUR
export const urls = {
  conditions: 'https://www.hamqsl.com/solarxml.php',
  flux: 'https://services.swpc.noaa.gov/json/f107_cm_flux.json',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  wind: 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json',
  history: 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind.json',
}
const en = {
  title: 'KI2D’s Solar Panel', description: 'Solar indices, band conditions and interactive history',
  unavailable: 'Solar weather unavailable. Retrying shortly.', update: 'This panel needs the panel environment API.',
  stale: 'Refresh failed', age: 'min ago', day: 'Day', night: 'Night', band: 'Band',
  good: 'Good', fair: 'Fair', poor: 'Poor', unknown: '—', wind: 'Wind',
  inspect: 'Solar history', history: 'NOAA history unavailable', mean: '3h mean',
}
const es: typeof en = {
  title: 'Panel solar de KI2D', description: 'Índices solares, propagación e historial interactivo',
  unavailable: 'Tiempo solar no disponible. Se reintentará pronto.', update: 'Este panel necesita la API de contexto visual.',
  stale: 'Actualización fallida', age: 'min atrás', day: 'Día', night: 'Noche', band: 'Banda',
  good: 'Buena', fair: 'Regular', poor: 'Mala', unknown: '—', wind: 'Viento',
  inspect: 'Historial solar', history: 'Historial NOAA no disponible', mean: 'media 3h',
}
const words = (locale?: string) => locale?.startsWith('es') ? es : en
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string' || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const rating = (s: string): Rating => ['good', 'fair', 'poor'].includes(s.trim().toLowerCase()) ? s.trim().toLowerCase() as Rating : 'unknown'
export function parseConditions(body: string): Conditions {
  const raw = parseSolarXml(body), flux = numeric(raw.solarflux)
  if (flux === null) throw new Error('Missing solar flux')
  const bands = new Map<string, { name: string; day: Rating; night: Rating }>()
  for (const match of body.matchAll(/<band\b([^>]*)>([^<]*)<\/band>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/(\w+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1], m[2].trim()]))
    if (!attrs.name || attrs.name.length > 40 || !['day', 'night'].includes(attrs.time)) continue
    const row = bands.get(attrs.name) ?? { name: attrs.name, day: 'unknown', night: 'unknown' }
    row[attrs.time as 'day' | 'night'] = rating(match[2]); bands.set(attrs.name, row)
    if (bands.size >= 12) break
  }
  return { flux, spots: numeric(raw.sunspots), a: numeric(raw.aindex), k: numeric(raw.kindex), wind: numeric(raw.solarwind), bands: [...bands.values()] }
}

/** NOAA timestamps without an offset are UTC, regardless of device timezone. */
export function parseSeries(body: string, field: 'flux' | 'Kp' | 'speed'): Point[] {
  const data: unknown = JSON.parse(body)
  if (!Array.isArray(data)) throw new Error('Invalid NOAA series')
  const header = Array.isArray(data[0]) ? data[0] : null
  const timeIndex = header?.indexOf('time_tag') ?? -1, valueIndex = header?.indexOf(field) ?? -1
  const points = new Map<number, number>()
  for (const row of data.slice(header ? 1 : 0, 15000)) {
    if (!row || typeof row !== 'object') continue
    const stamp = header ? row[timeIndex] : row.time_tag
    const value = numeric(header ? row[valueIndex] : row[field])
    if (typeof stamp !== 'string' || value === null || value < 0 || (field === 'Kp' && value > 9)) continue
    const time = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(stamp) ? stamp : `${stamp}Z`)
    if (Number.isFinite(time)) points.set(time, value)
  }
  if (!points.size) throw new Error('No valid NOAA readings')
  return [...points].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time)
}

export function mergePoints(base: Point[], recent: Point[]): Point[] {
  return [...new Map([...base, ...recent].map(p => [p.time, p.value]))].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time)
}
export function windBuckets(points: Point[]): Point[] {
  const bins = new Map<number, { sum: number; count: number }>()
  for (const p of points) {
    const time = Math.floor(p.time / BUCKET) * BUCKET, b = bins.get(time) ?? { sum: 0, count: 0 }
    b.sum += p.value; b.count++; bins.set(time, b)
  }
  return [...bins].map(([time, b]) => ({ time, value: b.sum / b.count })).sort((a, b) => a.time - b.time)
}

export function createSolarPanel(fetch: Fetch): PanelHook {
  let conditions: Conditions | undefined, fetched = 0, attempted: number | undefined, successful: number | undefined
  let failed = false, pending: Promise<void> | undefined, historyAttempt: number | undefined, historySuccess: number | undefined
  const feeds: Record<'flux' | 'kp' | 'wind', Feed> = { flux: { points: [], failed: false }, kp: { points: [], failed: false }, wind: { points: [], failed: false } }
  let windRaw: Point[] = []
  async function body(url: string) {
    const response = await fetch(url, { timeout: 3800 })
    if (response.status !== 200) throw new Error(`Solar HTTP ${response.status}`)
    return response.body
  }
  return {
    async getPanels(_args, ctx) {
      const t = words(ctx.locale)
      return [{ key: 'solar', title: t.title, description: t.description, icon: 'white-balance-sunny', multiple: true, on: ['tick:60'] }]
    },
    async render(args, ctx) {
      const t = words(args.environment?.locale ?? ctx.locale)
      if (!args.environment || !args.clock) return { kind: 'markdown', content: t.update }
      const { nowMillis: now, realNowMillis: real } = args.clock
      const due = successful === undefined || real - successful >= 15 * 60000
      if (due && (attempted === undefined || real - attempted >= 60000) && !pending) {
        attempted = real
        pending = (async () => {
          const historyDue = (historySuccess === undefined || real - historySuccess >= 6 * HOUR) && (historyAttempt === undefined || real - historyAttempt >= 15 * 60000)
          if (historyDue) historyAttempt = real
          await Promise.all([
            (async () => {
              try { conditions = parseConditions(await body(urls.conditions)); fetched = now; failed = false }
              catch { failed = true }
            })(),
            ...(['flux', 'kp'] as const).map(async key => {
              try { feeds[key] = { points: parseSeries(await body(urls[key]), key === 'flux' ? 'flux' : 'Kp'), fetched: now, failed: false } }
              catch { feeds[key].failed = true }
            }),
            (async () => {
              const [recent, history] = await Promise.all([
                body(urls.wind).then(b => parseSeries(b, 'speed')).catch(() => null),
                historyDue ? body(urls.history).then(b => parseSeries(b, 'speed')).catch(() => null) : Promise.resolve(null),
              ])
              if (history) historySuccess = real
              windRaw = mergePoints(mergePoints(windRaw, history ?? []), recent ?? []).slice(-11000)
              feeds.wind.points = windBuckets(windRaw)
              feeds.wind.failed = recent === null
              if (recent || history) feeds.wind.fetched = now
            })(),
          ])
          if (!failed) successful = real
        })().finally(() => { pending = undefined })
      }
      if (pending) await pending
      if (!conditions) return { kind: 'markdown', content: t.unavailable }
      return { kind: 'svgScene', scene: solarDocument(args.environment, conditions, feeds, now, fetched, failed) }
    },
  }
}

export function solarDocument(e: PanelEnvironment, r: Conditions, feeds: Record<'flux' | 'kp' | 'wind', Feed>, now: number, fetched: number, failed: boolean): SvgScene {
  const t = words(e.locale), c = e.colors, style = e.typography.label
  const width = Math.max(1, Math.min(8192, e.width)), height = Math.max(1, Math.min(8192, e.height))
  const left = e.safeInsets.left, top = e.safeInsets.top, w = width - left - e.safeInsets.right, h = height - top - e.safeInsets.bottom
  const layers: SvgSceneLayer[] = [], scene: SvgScene = { version: 1, width, height, values: { time: 56 }, layers }
  if (w < 40 || h < 30) return scene
  const line = style.scaledFontSize * style.lineHeight + 4, end = top + h - line - 6
  function text(id: string, value: string | string[], x: number, y: number, tw: number, role: 'label' | 'title' | 'display' = 'label', color = c.onSurface, scale = 1) {
    const s = e.typography[role], th = s.scaledFontSize * scale * s.lineHeight + 4
    if (tw < 1 || y + th > top + h) return
    layers.push({ id, x, y, width: tw, height: th, text: { ...(typeof value === 'string' ? { literal: value } : { value: 'time', samples: value }), size: s.fontSize * scale, fontFamily: s.fontFamily ?? undefined, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color } })
  }
  function svg(id: string, x: number, y: number, sw: number, sh: number, body: string): SvgSceneLayer {
    return { id, x, y, width: Math.max(1, sw), height: Math.max(1, sh), svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(1, sw)} ${Math.max(1, sh)}">${body}</svg>` }
  }
  const fmt = (v: number | null) => v === null ? '—' : String(Math.round(v * 10) / 10)
  layers.push(svg('surface', 0, 0, width, height, `<rect width="${width}" height="${height}" fill="${c.surface}"/>`))
  const role = w >= 220 && h >= 160 ? 'display' : 'title'
  const headline = [
    { id: 'sfi', label: `SFI ${fmt(r.flux)}`, color: c.onSurface },
    { id: 'sn', label: `SN ${fmt(r.spots)}`, color: c.onSurfaceVariant },
    { id: 'a', label: `A ${fmt(r.a)}`, color: r.a === null ? c.onSurfaceVariant : solarAColor(r.a) },
    { id: 'kp', label: `Kp ${fmt(r.k)}`, color: r.k === null ? c.onSurfaceVariant : solarKColor(r.k) },
  ]
  const headlineStyle = e.typography[role]
  const desiredWidths = headline.map(item => item.label.length * headlineStyle.scaledFontSize * .62)
  const desiredSun = Math.min(32, headlineStyle.scaledFontSize)
  // Scale the entire headline together so every index keeps equal prominence.
  const headlineScale = Math.min(1, (w - 20) / (desiredWidths.reduce((a, b) => a + b, 0) + desiredSun + 32))
  const sunSize = desiredSun * headlineScale, gap = 8 * headlineScale
  layers.push({ id: 'sun', x: left + 8, y: top + 10, width: sunSize, height: sunSize, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="${solarFluxColor(r.flux)}"/><path d="M12 1V5 M12 19V23 M1 12H5 M19 12H23 M4 4L7 7 M17 17L20 20 M4 20L7 17 M17 7L20 4" stroke="${solarFluxColor(r.flux)}" stroke-width="2"/></svg>` })
  let headlineX = left + 8 + sunSize + gap
  const spare = Math.max(0, w - 20 - (desiredWidths.reduce((a, b) => a + b, 0) + desiredSun + 32) * headlineScale) / 4
  for (const [i, item] of headline.entries()) {
    const itemWidth = desiredWidths[i] * headlineScale + spare
    text(item.id, item.label, headlineX, top + 6, itemWidth, role, item.color, headlineScale)
    headlineX += itemWidth + gap
  }
  let y = top + headlineStyle.scaledFontSize * headlineScale * headlineStyle.lineHeight + 14
  if (y + line < end) { text('wind', `${t.wind} ${fmt(r.wind)} km/s`, left + 10, y, w - 20, 'label', c.onSurfaceVariant); y += line }
  if (w >= 200 && y + (r.bands.length + 1) * line + 8 < end && r.bands.length) {
    const col = (w - 20) / 3
    for (const [i, label] of [t.band, t.day, t.night].entries()) {
      text(`band-heading-${i}`, label, left + 10 + i * col, y, col, 'label', c.outline)
      const heading = layers[layers.length - 1]
      if (i > 0 && heading.text) heading.text.align = 'center'
    }
    y += line
    for (const [i, band] of r.bands.entries()) {
      text(`band-${i}`, band.name, left + 10, y, col, 'label', c.onSurfaceVariant)
      for (const [j, rating] of [band.day, band.night].entries()) {
        const color = rating === 'unknown' ? c.outline : solarPalette[rating]
        const x = left + 10 + (j + 1) * col
        layers.push(svg(`band-background-${i}-${j}`, x + 2, y + 1, col - 4, line - 2, `<rect width="${col - 4}" height="${line - 2}" rx="3" fill="${color}" fill-opacity=".16"/>`))
        text(`band-${i}-${j}`, t[rating], x + 8, y, col - 16, 'label', color)
        const cell = layers[layers.length - 1]
        if (cell.text) { cell.text.fontWeight = 600; cell.text.align = 'center' }
      }
      y += line
    }
    y += 6
  }
  const start = now - WEEK
  const series = (['flux', 'wind', 'kp'] as const).map(key => ({ key, ...feeds[key], points: feeds[key].points.filter(p => p.time >= start && p.time <= now) }))
  const room = end - y - 8, minChart = line + 34
  const available = series.filter(s => s.points.length >= 2)
  // Preserve SFI and Kp when space only permits two histories.
  const chosen = available.filter(s => s.key !== 'wind' || room >= minChart * available.length).slice(0, Math.max(0, Math.floor(room / minChart)))
  const chartStart = y, chartHeight = chosen.length ? Math.min(150, room / chosen.length) : 0
  const sample = (samples: number[]): SceneBinding => ({ value: 'time', input: [0, 56], output: [samples[0], samples[56]], samples })
  const date = (time: number) => `${new Date(time).toISOString().slice(5, 16).replace('T', ' ')}Z`
  const timelines = Array.from({ length: 57 }, (_, i) => start + i * WEEK / 56)
  const valuesForTime: string[][] = []
  for (const series of chosen) {
    const { key, points } = series, label = key === 'flux' ? 'SFI' : key === 'kp' ? 'Kp' : `${t.wind} (${t.mean})`
    const suffix = key === 'wind' ? ' km/s' : ''
    const nearest = timelines.map(time => points.reduce((a, b) => Math.abs(a.time - time) <= Math.abs(b.time - time) ? a : b))
    const captions = nearest.map(p => `${label} ${fmt(p.value)}${suffix} · ${date(p.time)}${series.failed ? ` · ${t.stale}` : ''}`)
    valuesForTime.push(captions)
    text(`${key}-caption`, captions, left + 8, y, w - 16)
    const plotTop = y + line, ph = chartHeight - line - 8
    const lo = key === 'kp' ? 0 : Math.min(...points.map(p => p.value)) - 2
    const hi = key === 'kp' ? 9 : Math.max(lo + 4, ...points.map(p => p.value)) + 2
    const px = (time: number) => Math.max(4, Math.min(w - 4, 4 + (time - start) / (now - start || 1) * (w - 8)))
    const py = (value: number) => ph - 3 - (value - lo) / (hi - lo) * (ph - 6)
    const lineColor = key === 'wind' ? c.onSurfaceVariant : key === 'kp' ? c.onSurface : c.accent
    let art = `<path d="M0 ${ph} H${w}" stroke="${c.outlineVariant}"/>`
    if (key === 'kp') {
      for (const p of points) art += `<rect x="${px(p.time)}" y="${py(p.value)}" width="${Math.max(1, Math.min(w - px(p.time), (w - 8) / 56 - 1))}" height="${Math.max(.5, ph - py(p.value))}" fill="${solarKColor(p.value)}"/>`
    } else {
      let path = points.map((p, i) => `${i === 0 || p.time - points[i - 1].time > (key === 'wind' ? BUCKET * 2 : 30 * HOUR) ? 'M' : 'L'}${px(p.time)} ${py(p.value)}`).join(' ')
      if (key === 'flux') {
        // Carry the endpoint readings to the pane edges, as the native chart does.
        path = `M0 ${py(points[0].value)} L${path.slice(1)} L${w} ${py(points[points.length - 1].value)}`
      }
      art += `<defs><linearGradient id="${key}-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${lineColor}" stop-opacity="${key === 'wind' ? .16 : .20}"/><stop offset="1" stop-color="${lineColor}" stop-opacity="0"/></linearGradient></defs>`
      // Close each continuous segment separately so gaps remain unfilled.
      for (const segment of path.split('M').filter(Boolean)) {
        const coords = segment.trim().split(/\s*L/), firstX = coords[0].split(' ')[0], lastX = coords[coords.length - 1].split(' ')[0]
        art += `<path d="M${segment} L${lastX} ${ph} L${firstX} ${ph} Z" fill="url(#${key}-fill)"/>`
      }
      art += `<path d="${path}" stroke="${lineColor}" stroke-width="2" fill="none"/>`
    }
    layers.push(svg(`${key}-chart`, left, plotTop, w, ph + 1, art))
    layers.push({ ...svg(`${key}-cursor`, left, plotTop, 1, ph, `<path d="M.5 0V${ph}" stroke="${c.onSurfaceVariant}" stroke-dasharray="3 3"/>`), translateX: sample(nearest.map(p => px(p.time))) })
    layers.push({ ...svg(`${key}-point`, left - 4, plotTop - 4, 8, 8, `<circle cx="4" cy="4" r="3" fill="${c.surface}" stroke="${lineColor}" stroke-width="2"/>`), translateX: sample(nearest.map(p => px(p.time))), translateY: sample(nearest.map(p => py(p.value))) })
    y += chartHeight
  }
  if (chosen.length) scene.controls = [{ id: 'time', label: t.inspect, kind: 'slider', x: left, y: chartStart, width: w, height: y - chartStart, value: 'time', min: 0, max: 56, step: 1, hover: true, valueLabels: timelines.map((_, i) => valuesForTime.map(v => v[i]).join(' · ')) }]
  else if (!available.length && y + line < end) text('history-unavailable', t.history, left + 10, y, w - 20, 'label', c.onSurfaceVariant)
  text('source', `${failed ? `${t.stale} · ` : ''}${Math.max(0, Math.floor((now - fetched) / 60000))} ${t.age} · hamqsl.com / NOAA`, left + 10, end, w - 20, 'label', failed ? c.error : c.onSurfaceVariant)
  return scene
}
