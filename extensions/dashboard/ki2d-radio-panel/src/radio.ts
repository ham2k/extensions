// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import type { PanelHook, PanelRadioState, PanelRadioTune, PanelRadioTuneResult, PanelEnvironment, SvgScene, SvgSceneLayer } from '@ham2k/extension-sdk'
type RadioHost = { setRadioConnection?(args: { id: string; selection?: string; connected: boolean }): Promise<PanelRadioTuneResult>; listRadios?(): Promise<PanelRadioState[]>; readRadio(id?: string): Promise<PanelRadioState | null>; tuneRadio(args: PanelRadioTune): Promise<PanelRadioTuneResult> }
const en = {
  connect: 'Connect', disconnect: 'Disconnect', mode: 'Mode', radio: 'Radio', automatic: 'Automatic (logging radio)', style: 'Style', modern: 'Modern', lcd: 'LCD',
  title: 'KI2D’s Radio Panel', description: 'Live CAT readout, tuning dial and meters',
  none: 'Select a local radio in Station Configuration', disconnected: 'Disconnected', connecting: 'Connecting',
  connected: 'Connected', stale: 'No current radio data', error: 'Radio error', disconnecting: 'Disconnecting',
  tune: 'Tune frequency', requested: 'Requested', step: '5 kHz / turn · 100 Hz / step', release: 'Drag to tune',
  reported: 'Reported VFO', unavailable: 'Radio API unavailable', changed: 'The selected radio changed. Try again.',
  transmitting: 'Tuning is unavailable while transmitting.', invalid: 'Unsupported radio command.',
  rejected: 'Radio is not connected or its readings are stale.', awaiting: 'Awaiting radio confirmation', unconfirmed: 'Radio has not confirmed the requested tune',
}
const es: typeof en = {
  connect: 'Conectar', disconnect: 'Desconectar', mode: 'Modo', radio: 'Radio', automatic: 'Automática (radio del registro)', style: 'Estilo', modern: 'Moderno', lcd: 'LCD',
  title: 'Panel de radio de KI2D', description: 'Lecturas CAT, dial de sintonía y medidores',
  none: 'Selecciona una radio local en Configuración de estación', disconnected: 'Desconectada', connecting: 'Conectando',
  connected: 'Conectada', stale: 'Sin datos actuales de la radio', error: 'Error de radio', disconnecting: 'Desconectando',
  tune: 'Sintonizar frecuencia', requested: 'Solicitada', step: '5 kHz / vuelta · 100 Hz / paso', release: 'Arrastra para sintonizar',
  reported: 'VFO informado', unavailable: 'API de radio no disponible', changed: 'Cambió la radio seleccionada. Inténtalo de nuevo.',
  transmitting: 'No se puede sintonizar durante la transmisión.', invalid: 'Comando de radio no compatible.',
  rejected: 'La radio está desconectada o sus datos no son actuales.', awaiting: 'Esperando confirmación de la radio', unconfirmed: 'La radio no confirmó la sintonía solicitada',
}
const words = (locale?: string) => locale?.startsWith('es') ? es : en
const modes = ['LSB', 'USB', 'CW', 'AM', 'FM'] as const
export function createRadioPanel(host: RadioHost): PanelHook {
  const placements = new Map<string, { id: string | null; selection?: string; requested?: number; mode?: string; sent?: number }>()
  return {
    async getPanels(_args, ctx) {
      const t = words(ctx.locale)
      const radios = await host.listRadios?.() ?? []
      return [{ key: 'front-face', title: t.title, description: t.description, icon: 'radio-handheld', multiple: true, on: ['tick:1'], form: [
        { type: 'field', fieldType: 'select', key: 'radio', label: t.radio, value: 'auto', options: [
          { value: 'auto', label: t.automatic }, ...radios.filter(r => r.id).map(r => ({ value: r.id!, label: r.name ?? r.id! })),
        ] },
        { type: 'field', fieldType: 'select', key: 'style', label: t.style, value: 'modern', options: [
          { value: 'modern', label: t.modern }, { value: 'lcd', label: t.lcd },
        ] },
      ] } ]
    },
    async render(args, ctx) {
      const t = words(args.environment?.locale ?? ctx.locale)
      if (!args.environment || !args.clock) return { kind: 'markdown', content: t.unavailable }
      const selection = typeof args.config.radio === 'string' && args.config.radio !== 'auto' ? args.config.radio : undefined
      const r = await host.readRadio(selection)
      const key = args.instanceId ?? 'default'
      let p = placements.get(key)
      if (!p || p.id !== r?.id || p.selection !== selection) {
        p = { id: r?.id ?? null, selection }; placements.set(key, p)
        if (placements.size > 64) placements.delete(placements.keys().next().value!)
      }
      if (p.requested !== undefined && r?.frequencyHz === p.requested) delete p.requested
      if (p.mode !== undefined && r?.mode === p.mode) delete p.mode
      const waiting = p.requested !== undefined || p.mode !== undefined
      const pending = waiting ? ((args.clock.realNowMillis - (p.sent ?? 0)) > 5000 ? t.unconfirmed : t.awaiting) : ''
      return { kind: 'svgScene', title: r?.name?.trim() || t.title, scene: radioDocument(args.environment, r, p.requested, pending, args.config.style === 'lcd' ? 'lcd' : 'modern') }
    },
    async onEvent(args, ctx) {
      const t = words(args.environment?.locale ?? ctx.locale), p = placements.get(args.instanceId ?? 'default')
      if (!p?.id) throw new Error(t.rejected)
      const event = args.event
      const selection = typeof args.config.radio === 'string' && args.config.radio !== 'auto' ? args.config.radio : undefined
      if (selection !== p.selection) throw new Error(t.changed)
      if (event.controlId === 'connection' && event.phase === 'activate' && ['connect', 'disconnect'].includes(event.action)) {
        if (!host.setRadioConnection) throw new Error(t.unavailable)
        const result = await host.setRadioConnection({ id: p.id, ...(selection ? { selection } : {}), connected: event.action === 'connect' })
        if (!result.accepted) throw new Error(result.reason === 'changed' ? t.changed : t.rejected)
        delete p.requested; delete p.mode
        return { values: {} as Record<string, number> }
      }
      let command: PanelRadioTune
      if (event.action === 'tune' && event.controlId === 'tuning-knob' && ['change', 'commit'].includes(event.phase) && Number.isFinite(event.value)) {
        command = { id: p.id, frequencyHz: Math.round(event.value! * 1000) }
      } else if (event.controlId === 'mode' && event.phase === 'activate' && event.action.startsWith('mode-') && modes.includes(event.action.slice(5) as typeof modes[number])) {
        command = { id: p.id, mode: event.action.slice(5) as typeof modes[number] }
      } else throw new Error(t.invalid)
      if (selection) command.selection = selection
      const result = await host.tuneRadio(command)
      if (!result.accepted) throw new Error(result.reason === 'changed' ? t.changed : result.reason === 'transmitting' ? t.transmitting : result.reason === 'invalid' ? t.invalid : t.rejected)
      p.requested = command.frequencyHz ?? p.requested
      p.mode = command.mode ?? p.mode
      p.sent = args.clock?.realNowMillis ?? 0
      // Reported readouts only change on radio telemetry, never on acceptance.
      return { values: { requested: (p.requested ?? result.state?.frequencyHz ?? 0) / 1000 } }
    },
  }
}

export function radioDocument(e: PanelEnvironment, r: PanelRadioState | null, requestedHz?: number, pending = '', style: 'modern' | 'lcd' = 'modern'): SvgScene {
  const t = words(e.locale), c = style === 'lcd' ? { ...e.colors,
    surface: '#0d1418', surfaceContainer: '#14232a', onSurface: '#00b4e6', onSurfaceVariant: '#67c4de',
    accent: '#00b4e6', primary: '#00b4e6', onPrimary: '#0d1418', outline: '#3a6f80', outlineVariant: '#17313b',
  } : e.colors
  const width = Math.max(1, Math.min(8192, e.width)), height = Math.max(1, Math.min(8192, e.height))
  const left = e.safeInsets.left, top = e.safeInsets.top, w = width - left - e.safeInsets.right, h = height - top - e.safeInsets.bottom
  const frequency = (r?.frequencyHz ?? 0) / 1000, requested = (requestedHz ?? r?.frequencyHz ?? 0) / 1000
  const center = Math.round(frequency / 100) * 100, min = Math.max(.001, center - 100), max = Math.max(min + 200, center + 100)
  const live = r?.status === 'connected' && !r.stale && !r.problem, canTune = live && r.canTune && r.transmitting !== true
  const layers: SvgSceneLayer[] = [], scene: SvgScene = { version: 1, width, height, values: { reported: frequency, requested, rf: r?.meters.powerOut ?? 0 }, layers, controls: [] }
  if (w < 70 || h < 50) return scene
  const label = e.typography.label, line = label.scaledFontSize * label.lineHeight + 4
  function svg(id: string, x: number, y: number, sw: number, sh: number, art: string): SvgSceneLayer {
    return { id, x, y, width: sw, height: sh, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}">${art}</svg>` }
  }
  function text(id: string, value: string, x: number, y: number, tw: number, role: 'label' | 'display' | 'mono' = 'label', color = c.onSurface) {
    const s = e.typography[role], th = s.scaledFontSize * s.lineHeight + 4
    if (tw < 1 || y + th > top + h) return
    layers.push({ id, x, y, width: tw, height: th, text: { literal: value, size: s.fontSize, fontFamily: s.fontFamily ?? undefined, fontWeight: s.fontWeight, lineHeight: s.lineHeight, color } })
  }
  layers.push(svg('face', 0, 0, width, height, `<rect width="${width}" height="${height}" fill="${c.surface}"/>`))
  const headerY = top + 8, powerWidth = 46, modeWidth = 64
  text('power', r?.powerWatts == null ? '— W' : `${r.powerWatts} W`, left + 12, headerY, powerWidth, 'label', c.onSurfaceVariant)
  const modeX = left + 12 + powerWidth
  layers.push(svg('mode-pill', modeX, headerY, modeWidth, line, `<rect width="${modeWidth}" height="${line}" rx="${line / 2}" fill="${style === 'modern' ? c.primary : c.surfaceContainer}" fill-opacity="${style === 'modern' ? .12 : 1}"/><path d="M${modeWidth - 18} ${line / 2 - 2}l4 4 4-4" fill="none" stroke="${c.onSurfaceVariant}" stroke-width="1.5"/>`))
  text('mode', r?.mode ?? '—', modeX + 8, headerY, modeWidth - 26)
  if (canTune) scene.controls!.push({ id: 'mode', label: t.mode, kind: 'button', x: modeX, y: headerY, width: modeWidth, height: line,
    menu: modes.map(mode => ({ label: mode, event: `mode-${mode}` })) })
  const connectionX = modeX + modeWidth + 12, iconX = left + w - 32
  const nameWidth = Math.max(1, iconX - connectionX - 6)
  text('radio-name', r?.name ?? t.radio, connectionX, headerY, nameWidth, 'label', c.onSurfaceVariant)
  const name = layers.find(l => l.id === 'radio-name')
  if (name?.text) name.text.align = 'end'
  const on = r?.status === 'connected' || r?.status === 'connecting'
  layers.push(svg('connection-icon', iconX, headerY + (line - 20) / 2, 20, 20, style === 'lcd'
    ? `<circle cx="10" cy="10" r="10" fill="#ed3326" fill-opacity="${on ? '.18' : '0'}"/><circle cx="10" cy="10" r="5" fill="${on ? '#ed3326' : '#542322'}"/>`
    : `<path d="M10 2v8M5 5a7 7 0 1 0 10 0" fill="none" stroke="${on ? c.accent : c.outline}" stroke-width="2" stroke-linecap="round"/>`))
  if (r?.id && r.status !== 'disconnecting') scene.controls!.push({ id: 'connection', label: `${on ? t.disconnect : t.connect} ${r.name ?? t.radio}`, kind: 'button', x: connectionX, y: headerY, width: Math.max(20, left + w - 12 - connectionX), height: line, event: on ? 'disconnect' : 'connect' })
  let y = top + line + 16
  const status = !r?.id ? t.none : r.stale ? t.stale : t[r.status]
  if (w >= 220 && h >= 160) {
    const received = live && r?.transmitting !== true ? r?.meters.signalDbm : undefined
    const dbm = received !== undefined && Number.isFinite(received) ? received : undefined
    text('receive-level', dbm === undefined ? '— dBm' : `${dbm.toFixed(0)} dBm`, left + 12, y, 88, 'label', c.onSurfaceVariant)
    const meterWidth = w - 124, count = 30, gap = 2, segmentWidth = (meterWidth - gap * (count - 1)) / count
    const lit = dbm === undefined ? 0 : Math.round(Math.max(0, Math.min(1, (dbm + 130) / 120)) * count)
    const segments = Array.from({ length: count }, (_, i) => {
      const color = i < 15 ? (style === 'lcd' ? c.accent : '#2e9e4f') : i < 24 ? '#c98a16' : '#d04a34'
      return `<rect x="${i * (segmentWidth + gap)}" y="2" width="${segmentWidth}" height="12" rx="1" fill="${i < lit ? color : c.outlineVariant}" fill-opacity="${i < lit ? 1 : .4}"/>`
    }).join('')
    layers.push(svg('receive-meter', left + 112, y, meterWidth, 16, segments))
    for (const db of [-120, -90, -60, -30]) {
      const x = left + 112 + ((db + 130) / 120) * meterWidth - 14
      layers.push({ id: `receive-scale-${db}`, x, y: y + 16, width: 28, height: 16,
        text: { literal: `${db}`, size: 10, color: c.onSurfaceVariant, align: 'center' } })
    }
    y += Math.max(line, 32) + 6
  }
  const knobSize = Math.min(72, Math.max(44, w * .16))
  const showKnob = w >= 180 && y + knobSize + line + 12 < top + h
  const frequencyWidth = w - 24 - (showKnob ? knobSize + 12 : 0)
  const frequencyRole = frequencyWidth >= 280 ? 'display' : 'mono'
  const frequencyHeight = e.typography[frequencyRole].scaledFontSize * e.typography[frequencyRole].lineHeight + 4
  const rowHeight = Math.max(frequencyHeight, showKnob ? knobSize : 0)
  if (style === 'modern' && (r?.frequencyHz != null || requestedHz !== undefined)) {
    const mhz = Math.floor(requested / 1000)
    const mhzDigits = Math.max(1, String(mhz).length)
    const base = e.typography.display
    const units = (mhz > 0 ? mhzDigits + 3.5 : Math.max(1, String(Math.floor(requested)).length)) + 2.3
    const size = Math.min(base.fontSize, frequencyWidth / (units * .62 * (base.scaledFontSize / base.fontSize)))
    const scaled = size * base.scaledFontSize / base.fontSize, digit = scaled * .62
    const topY = y + (rowHeight - scaled * base.lineHeight) / 2
    const group = e.locale.startsWith('es') ? '.' : ',', decimal = e.locale.startsWith('es') ? ',' : '.'
    let x = left + 12
    function part(id: string, count: number, spec: NonNullable<SvgSceneLayer['text']>, small = false) {
      const partSize = small ? size * .6 : size
      const pw = count * digit
      layers.push({ id, x, y: topY + (small ? scaled * .4 * .85 : 0), width: pw + 4, height: scaled * (small ? .6 : 1) * base.lineHeight + 4,
        text: { size: partSize, fontFamily: base.fontFamily ?? undefined, lineHeight: base.lineHeight, color: live ? c.accent : c.outline, ...spec } })
      x += pw
    }
    if (mhz > 0) {
      part('frequency-mhz', mhzDigits, { value: 'requested', scale: .001, truncate: true, fontWeight: 700 })
      part('frequency-group', .5, { literal: group })
      part('frequency-khz', 3, { value: 'requested', truncate: true, modulo: 1000, minIntegerDigits: 3 })
    } else {
      part('frequency-khz', Math.max(1, String(Math.floor(requested)).length), { value: 'requested', truncate: true, fontWeight: 700 })
    }
    part('frequency-decimal', .5, { literal: decimal })
    part('frequency-hz', 1.8, { value: 'requested', scale: 1000, modulo: 1000, minIntegerDigits: 3 }, true)
  } else if (style === 'lcd' && (r?.frequencyHz != null || requestedHz !== undefined)) {
    const before = Math.max(1, String(Math.floor(requested)).length), count = before + 3
    const digitWidth = Math.min(30, frequencyWidth / (count * 1.2 + .5))
    const digitHeight = digitWidth * 1.7, digitY = y + (rowHeight - digitHeight) / 2
    const segments = [
      'M2 1H18L15 4H5Z', 'M18 2L19 3V14L16 16V5Z', 'M19 18V29L18 30L16 27V19Z',
      'M2 31L5 28H15L18 31Z', 'M1 18L4 19V27L2 30L1 29Z', 'M1 3L2 2L4 5V14L1 16Z', 'M2 16L5 14H15L18 16L15 18H5Z',
    ]
    const masks = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]
    let x = left + 12
    for (let i = 0; i < count; i++) {
      if (i === before) {
        layers.push(svg('lcd-dot', x, digitY + digitHeight - 4, 4, 4, `<circle cx="2" cy="2" r="2" fill="${c.accent}"/>`)); x += digitWidth * .4
      } else if (i > 0 && (before - i) % 3 === 0 && i < before) x += digitWidth * .2
      const art = (path: string, opacity = 1) => `<g transform="scale(${digitWidth / 20} ${digitHeight / 32})"><path d="${path}" fill="${c.accent}" fill-opacity="${opacity}"/></g>`
      layers.push(svg(`lcd-ghost-${i}`, x, digitY, digitWidth, digitHeight, art(segments.join(''), .13)))
      for (let segment = 0; segment < 7; segment++) {
        layers.push({ ...svg(`lcd-${i}-${segment}`, x, digitY, digitWidth, digitHeight, art(segments[segment])),
          opacity: { value: 'requested', scale: Math.pow(10, i - before + 1), truncate: true, modulo: 10,
            input: [0, 9], output: [0, 1], samples: masks.map(mask => mask & (1 << segment) ? (live ? 1 : .4) : 0) } })
      }
      x += digitWidth * 1.2
    }
  } else {
    text('frequency', r?.frequencyHz == null ? '— MHz' : `${(r.frequencyHz / 1e6).toFixed(6)} MHz`, left + 12, y + (rowHeight - frequencyHeight) / 2, frequencyWidth, frequencyRole, live ? c.onSurface : c.outline)
    const mainReadout = layers.find(l => l.id === 'frequency')
    if (mainReadout?.text && (r?.frequencyHz != null || requestedHz !== undefined)) {
      delete mainReadout.text.literal
      Object.assign(mainReadout.text, { value: 'requested', scale: .001, decimals: 6, suffix: ' MHz' })
    }
  }
  if (showKnob) {
    const knobX = left + w - 12 - knobSize, knobY = y + (rowHeight - knobSize) / 2
    layers.push(svg('knob', knobX, knobY, knobSize, knobSize, `<circle cx="${knobSize / 2}" cy="${knobSize / 2}" r="${knobSize / 2 - 2}" fill="${c.surfaceContainer}" stroke="${c.outline}" stroke-width="2"/>`))
    layers.push({ ...svg('knob-pointer', knobX, knobY, knobSize, knobSize, `<path d="M${knobSize / 2} 8v14" stroke="${canTune ? c.accent : c.outlineVariant}" stroke-width="4" stroke-linecap="round"/>`), rotation: { value: 'requested', input: [min, max], output: [min * 360 / 5, max * 360 / 5] } })
    if (canTune) scene.controls!.push({ id: 'tuning-knob', label: t.tune, kind: 'knob', x: knobX, y: knobY, width: knobSize, height: knobSize, value: 'requested', min, max, step: .1, sensitivity: .2, event: 'tune', continuous: true })
  }
  y += rowHeight + 8
  const bottom = top + h - line - 6
  const notice = pending || r?.problem || (!live ? status : '')
  if (notice) text('confirmation', notice, left + 12, bottom, w - 24, 'label', pending ? c.secondary : c.onSurfaceVariant)
  const meters = [r?.meters.powerOut == null ? '' : `RF ${r.meters.powerOut.toFixed(1)} W`, r?.meters.swr == null ? '' : `SWR ${r.meters.swr.toFixed(1)}`, r?.meters.supplyVolts == null ? '' : `${r.meters.supplyVolts.toFixed(1)} V`].filter(Boolean).join(' · ')
  if (live && meters && y + line * 2 + 10 < bottom) text('meters', meters, left + 12, y + line + 10, w - 24)
  return scene
}
