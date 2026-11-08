// Copyright ©️ 2026 Ian Renton
// SPDX-License-Identifier: MIT
//
// Spothole (https://spothole.app) gathers spots from DX clusters, the RBN,
// APRS-IS and dozens of xOTA programmes into one feed. This extension puts
// these spots on Ham2k logger's spots panel.

import { defineExtension, host } from "@ham2k/extension-sdk"
import type { HookContext, Spot } from "@ham2k/extension-sdk"

import { parseSpots, SpotStore, spotsUrl } from "./spothole.ts"

import manifest from "../manifest.json" with { type: "json" }

const store = new SpotStore()

const SpotsHook = {
  sourceName: 'Spothole',

  async fetchSpots(_args: Record<string, never>, ctx: HookContext): Promise<Spot[]> {
    store.prune(Date.now())
    if (!ctx.online) return store.spots()

    try {
      const response = await host.fetch(spotsUrl(store.cursor), { headers: { Accept: 'application/json' } })
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
      store.add(parseSpots(response.body))
    } catch (error) {
      host.log(`Spothole: reading spots failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return store.spots()
  },
}

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook('spots', { hook: SpotsHook, key: manifest.key })
  },
})
