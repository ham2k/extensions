// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The New York QSO Party.
//
// Sixty-two counties on three-letter codes, and three of the engine's options
// turned on where Texas leaves all of them at their defaults: county lines,
// DC scored as Maryland, and the state itself as a multiplier for a New York
// entrant alongside the county a contact came from. A points table on top —
// phone 1, CW 2, digital 3 — so a contact's worth is the party's data too.
// None of that reaches this file: it is all `QsoPartyParams`, which is why the
// party with options is exactly as long as the party without them.

import { defineExtension } from "@ham2k/extension-sdk"
import { defineQsoParty } from "@ham2k/lib-qso-party"
import { PARTY } from "@ham2k/qso-parties/ny"

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
