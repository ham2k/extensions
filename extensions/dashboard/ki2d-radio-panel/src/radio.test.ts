// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PanelEnvironment, PanelRenderArgs, HookContext, PanelRadioState, PanelRadioTune } from '@ham2k/extension-sdk'
import { createRadioPanel, radioDocument } from './radio.ts'

const style = { fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji'], fontSize: 14, scaledFontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
const environment: PanelEnvironment = {
  version: 1, width: 440, height: 600, safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
  brightness: 'dark', colors: {
    surface: '#101010', surfaceContainer: '#202020', onSurface: '#eeeeee', onSurfaceVariant: '#bbbbbb',
    accent: '#00ffff', primary: '#00cccc', onPrimary: '#000000', secondary: '#ff00ff',
    outline: '#aaaaaa', outlineVariant: '#555555', error: '#ff0000', onError: '#ffffff',
  },
  typography: { body: style, label: style, title: style, display: { ...style, fontSize: 36, scaledFontSize: 36 }, mono: { ...style, fontFamily: 'RobotoMono' } },
  locale: 'en', textDirection: 'ltr', devicePixelRatio: 2, reducedMotion: false, highContrast: false,
}
const now = Date.UTC(2026, 8, 17, 12)
const args: PanelRenderArgs = { panelKey: 'front-face', operation: { grid: 'FN42' }, qsoCount: 0, config: {}, reason: 'initial', environment, clock: { nowMillis: now, realNowMillis: now } }
const ctx: HookContext = { online: true, locale: 'en', distanceUnits: 'kilometers' }

const live: PanelRadioState = { id: 'rig-a', name: 'Test radio', status: 'connected', stale: false, problem: null, frequencyHz: 14074000, mode: 'USB', powerWatts: 5, transmitting: false, meters: {}, canTune: true }

test('a tune is a request, not a reported reading; confirmation comes from the radio', async () => {
  let state = { ...live }; const commands: PanelRadioTune[] = []
  const panel = createRadioPanel({ readRadio: async () => state, tuneRadio: async command => { commands.push(command); return { accepted: true, state } } })
  await panel.render(args, ctx)
  await panel.onEvent!({ ...args, event: { controlId: 'tuning-knob', action: 'tune', phase: 'change', sequence: 1, value: 14075 } }, ctx)
  assert.deepEqual(commands, [{ id: 'rig-a', frequencyHz: 14075000 }])
  const pending = await panel.render(args, ctx)
  assert.equal(pending.kind, 'svgScene')
  if (pending.kind !== 'svgScene') return
  assert.equal(pending.scene.values.reported, 14074)
  assert.equal(pending.scene.values.requested, 14075)
  assert.equal(pending.scene.layers.find(l => l.id === 'frequency-mhz')!.text!.value, 'requested')
  assert.equal(pending.scene.layers.find(l => l.id === 'frequency-mhz')!.text!.scale, .001)
  assert.ok(pending.scene.controls!.filter(c => c.event === 'tune').every(c => c.continuous))
  assert.match(pending.scene.layers.find(l => l.id === 'confirmation')!.text!.literal!, /Awaiting/)
  state = { ...state, frequencyHz: 14075000 }
  const confirmed = await panel.render(args, ctx)
  if (confirmed.kind === 'svgScene') assert.equal(confirmed.scene.values.reported, 14075)
})

test('disconnected, stale and transmitting radios expose no tuning controls or invented RX state', () => {
  for (const state of [null, { ...live, canTune: false, stale: true }, { ...live, transmitting: true }]) {
    const scene = radioDocument(environment, state)
    assert.ok(scene.controls!.every(c => c.id === 'connection'))
    if (state === null) assert.equal(scene.layers.find(l => l.id === 'frequency')!.text!.literal, '— MHz')
  }
  const scene = radioDocument(environment, live)
  assert.ok(scene.controls!.some(c => c.kind === 'knob'))
  assert.ok(!scene.controls!.some(c => c.kind === 'slider'))
  assert.ok(scene.controls!.some(c => c.id === 'mode' && c.menu?.some(item => item.event === 'mode-CW')))
})

test('commands retain their rendered radio identity and surface host refusal', async () => {
  const commands: PanelRadioTune[] = []
  const panel = createRadioPanel({ readRadio: async () => live, tuneRadio: async c => { commands.push(c); return { accepted: false, reason: 'changed', state: { ...live, id: 'rig-b' } } } })
  await panel.render(args, ctx)
  await assert.rejects(panel.onEvent!({ ...args, event: { controlId: 'mode', action: 'mode-CW', phase: 'activate', sequence: 2 } }, ctx), /selected radio changed/)
  assert.equal(commands[0].id, 'rig-a')
  await assert.rejects(panel.onEvent!({ ...args, event: { controlId: 'fake', action: 'tune', phase: 'commit', value: 14000, sequence: 3 } }, ctx), /Unsupported/)
  assert.equal(commands.length, 1)
})


test('settings list local radios and pin tuning independently per placement', async () => {
  const reads: (string | undefined)[] = [], commands: PanelRadioTune[] = []
  const other = { ...live, id: 'rig-b', name: 'Second radio' }
  const panel = createRadioPanel({
    listRadios: async () => [live, other],
    readRadio: async id => { reads.push(id); return id === 'rig-b' ? other : live },
    tuneRadio: async command => { commands.push(command); return { accepted: true, state: other } },
  })
  const descriptors = await panel.getPanels({}, ctx)
  const options = descriptors[0].form![0].options
  assert.ok(Array.isArray(options))
  assert.deepEqual(options.map(o => o.value), ['auto', 'rig-a', 'rig-b'])
  const pinned = { ...args, instanceId: 'pinned', config: { radio: 'rig-b', style: 'lcd' } }
  const rendered = await panel.render(pinned, ctx)
  assert.equal(reads[reads.length - 1], 'rig-b')
  assert.equal(rendered.kind, 'svgScene')
  if (rendered.kind === 'svgScene') assert.ok(rendered.scene.layers.some(l => l.id === 'lcd-0-0'))
  await panel.onEvent!({ ...pinned, event: { controlId: 'tuning-knob', action: 'tune', phase: 'change', sequence: 1, value: 14075 } }, ctx)
  assert.deepEqual(commands[0], { id: 'rig-b', selection: 'rig-b', frequencyHz: 14075000 })
  await assert.rejects(panel.onEvent!({ ...pinned, config: { radio: 'auto' }, event: { controlId: 'mode', action: 'mode-CW', phase: 'activate', sequence: 2 } }, ctx), /selected radio changed/)
  const modern = radioDocument(environment, live)
  assert.equal(modern.layers.find(l => l.id === 'frequency-mhz')!.text!.fontWeight, 700)
  assert.equal(modern.layers.find(l => l.id === 'frequency-hz')!.text!.minIntegerDigits, 3)
  assert.ok(modern.layers.find(l => l.id === 'frequency-hz')!.text!.size! < modern.layers.find(l => l.id === 'frequency-khz')!.text!.size!)
})


test('header connects the configured radio and exposes modes as a dropdown', async () => {
  const connections: unknown[] = []
  const panel = createRadioPanel({ readRadio: async () => live,
    tuneRadio: async () => ({ accepted: true, state: live }),
    setRadioConnection: async c => { connections.push(c); return { accepted: true, state: live } },
  })
  const pinned = { ...args, config: { radio: live.id } }
  await panel.render(pinned, ctx)
  await panel.onEvent!({ ...pinned, event: { controlId: 'connection', action: 'disconnect', phase: 'activate', sequence: 1 } }, ctx)
  assert.deepEqual(connections, [{ id: live.id, selection: live.id, connected: false }])
  const scene = radioDocument(environment, live)
  assert.equal(scene.layers.find(l => l.id === 'radio-name')?.text?.align, 'end')
  assert.ok(!scene.layers.some(l => l.id === 'confirmation' || l.id.startsWith('mode-plate-')))
  assert.deepEqual(scene.controls?.find(c => c.id === 'mode')?.menu?.map(m => m.label), ['LSB', 'USB', 'CW', 'AM', 'FM'])
})


test('receive meter uses real dBm and removes the old indicators', () => {
  const scene = radioDocument(environment, { ...live, meters: { signalDbm: -93.5 } })
  assert.equal(scene.layers.find(l => l.id === 'receive-level')?.text?.literal, '-94 dBm')
  assert.ok(scene.layers.find(l => l.id === 'receive-meter')?.svg?.includes('<rect'))
  assert.ok(!scene.layers.some(l => l.id.startsWith('led-')))
  for (const r of [{ ...live, meters: {} }, { ...live, stale: true, meters: { signalDbm: -50 } }, { ...live, transmitting: true, meters: { signalDbm: -50 } }]) {
    assert.equal(radioDocument(environment, r).layers.find(l => l.id === 'receive-level')?.text?.literal, '— dBm')
  }
})
