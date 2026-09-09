// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The Texas QSO Party.
//
// Every rule this extension applies is `@ham2k/lib-qso-party`'s and every fact
// about the event is `@ham2k/qso-parties`'; this file is only where the two
// meet the host. A party with nothing unusual about it — no options, no points
// table, no bonus stations — is therefore this short, and a party that needs
// more says so in its DATA rather than here.

import { defineExtension } from "@ham2k/extension-sdk"
import { defineQsoParty } from "@ham2k/lib-qso-party"
import { PARTY } from "@ham2k/qso-parties/tx"

import manifest from "../manifest.json" with { type: "json" }

// The icon and the accent are the EXTENSION's, not the sponsor's rules: the
// party data is generated from the sponsor's own file and carries no chrome,
// and the manifest is where the Extensions panel reads them from already.
const hooks = defineQsoParty({ ...PARTY, icon: manifest.icon, accentColor: manifest.accentColor })

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook("activity", { hook: hooks.activity, key: manifest.key })
    // The ref TYPE names the party and deliberately does NOT follow the
    // compact key: the key identifies the package in the catalog, the refType
    // identifies the activation stored in an operator's operation, which a
    // renamed package still has to answer for. This extension is the only
    // thing that answers for it, and `manifest.hooks` has to say the same, or
    // the app is told about a hook nobody registered.
    registerHook(`ref:${hooks.refType}`, { hook: hooks.refHandler, key: manifest.key })
    registerHook("adifFields", { hook: hooks.adifFields, key: manifest.key })
    registerHook("export", { hook: hooks.export, key: manifest.key })
    registerHook("scoring", { hook: hooks.scoring, key: manifest.key })
  },
})
