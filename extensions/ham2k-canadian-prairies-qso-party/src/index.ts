// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The Canadian Prairies QSO Party.
//
// Three provinces, sixty-three DISTRICTS rather than counties, and district
// codes three characters long that carry no province prefix — so the party's
// data answers every code from its own table (`stateOfCounty`) and nothing ever
// reads the fallback. That is why this file is the same length as a
// single-state party's: what differs between two QSO parties is data, and the
// engine's options are what a party file states.

import { defineExtension } from "@ham2k/extension-sdk"
import { defineQsoParty } from "@ham2k/lib-qso-party"
import { PARTY } from "@ham2k/qso-parties/cpqp"

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
