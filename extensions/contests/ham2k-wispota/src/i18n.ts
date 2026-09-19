// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// User-visible strings, following ham2k-stateparks' pattern: per-locale flat
// key → string catalogs in i18n/<locale>.json, with hooks building a translator
// from `ctx.locale` via `tFor`.
//
// The event's name is NOT here: it is the sponsor's own proper name, and an
// operator searching for it wants the string the sponsor's site uses.

import { createCachedTranslator } from "@ham2k/extension-sdk"

import en from "./i18n/en.json" with { type: "json" }
import es from "./i18n/es.json" with { type: "json" }

/// Translator for this extension's strings, cached per locale — `ctx.locale`
/// only changes when the app's locale setting does.
export const tFor = createCachedTranslator({ en: { translation: en }, es: { translation: es } })
