// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The Colorado QSO Party.
//
// Every rule this extension applies is `@ham2k/lib-qso-party`'s and every fact
// about the event is `@ham2k/qso-parties`'; this file is only where the two meet
// the host. So an event with options, a points table and bonus stations is
// exactly as long as one with none: what differs between two QSO parties is
// DATA, and a rule that is not in the party file is a rule this extension does
// not apply.
//
// GENERATED — `node scripts/generate-event-extensions.mjs` writes this file and
// the manifest beside it from `packages/qso-parties`. Edit the party's fixture
// and re-run; an edit here is lost on the next re-sync.

import { defineExtension } from "@ham2k/extension-sdk"
import { defineQsoParty } from "@ham2k/lib-qso-party"
import { PARTY } from "@ham2k/qso-parties/co"

import manifest from "../manifest.json" with { type: "json" }

// The key, the icon and the accent are the EXTENSION's, not the sponsor's
// rules: the party data is generated from the sponsor's own file and carries
// none of them. The key has to be the one every hook below registers under —
// the party's own ADIF export reaches its `adifFields` hook by it.
const hooks = defineQsoParty({ ...PARTY, extensionKey: manifest.key, icon: manifest.icon, accentColor: manifest.accentColor })

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
    // The same handler under the legacy pairs this party answers for. The
    // kernel resolves a `ref:qp` call against these by the reference's own
    // code, longest prefix first, so the party that named the reference
    // answers it and the one that claimed the family does not.
    for (const claim of PARTY.legacyRefs ?? []) {
      registerHook(`ref:${claim.type}/${claim.prefix}`, { hook: hooks.refHandler, key: manifest.key })
    }
    registerHook("adifFields", { hook: hooks.adifFields, key: manifest.key })
    registerHook("export", { hook: hooks.export, key: manifest.key })
    registerHook("scoring", { hook: hooks.scoring, key: manifest.key })
  },
})
