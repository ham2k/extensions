// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The 7th Call Area QSO Party.
//
// Eight states' worth of counties, plus the neighbouring parties' counties its
// entrants also work that weekend, and no county-to-state table at all: every
// code carries its state in its first two characters (`ORDES` is Oregon's
// Deschutes), which is the rule the engine falls back on. So the largest party
// in the set needs no more code than the smallest — only more data.

import { defineExtension } from "@ham2k/extension-sdk"
import { defineQsoParty } from "@ham2k/lib-qso-party"
import { PARTY } from "@ham2k/qso-parties/7qp"

import manifest from "../manifest.json" with { type: "json" }

// The icon and the accent are the EXTENSION's, not the sponsor's rules: the
// party data is generated from the sponsor's own file and carries no chrome,
// and the manifest is where the Extensions panel reads them from already.
const hooks = defineQsoParty({ ...PARTY, icon: manifest.icon, accentColor: manifest.accentColor })

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook("activity", { hook: hooks.activity, key: manifest.key })
    // The ref TYPE names the party — this extension is the only thing that
    // answers for it, and `manifest.hooks` has to say the same, or the app is
    // told about a hook nobody registered.
    registerHook(`ref:${hooks.refType}`, { hook: hooks.refHandler, key: manifest.key })
    registerHook("adifFields", { hook: hooks.adifFields, key: manifest.key })
    registerHook("export", { hook: hooks.export, key: manifest.key })
    registerHook("scoring", { hook: hooks.scoring, key: manifest.key })
  },
})
