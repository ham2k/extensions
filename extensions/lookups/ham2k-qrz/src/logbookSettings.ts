// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The QRZ.com Logbook keys, one per logbook, listed in Settings → Exports &
// Imports and kept in the keychain rather than in plain settings. Each row is
// titled by the logbook QRZ.com says its key opens, asked once, as it is added.

import { host } from "@ham2k/extension-sdk"
import type { DynamicSettingsPanel, FormDefinition, FormElement, HookContext, JSONValue } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.ts"
import { logbookLabel, logbookStatus, shortKey, statusFailure, type Logbook } from "./logbook.ts"

import manifest from "../manifest.json" with { type: "json" }

/// The keychain key, and the list field's.
export const LOGBOOKS = "logbooks"

/// A logbook's key, with the logbook STATUS named for the key in `checked`:
/// one edited since is asked about again.
export type LogbookEntry = { key: string; call?: string; name?: string; checked?: string }

/// The rows in [value] that hold a key, as stored. Everything else a row
/// carries on its way through the form (its title) is left behind.
export function entriesIn(value: unknown): LogbookEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LogbookEntry[] = []
  for (const row of value) {
    const key = typeof row?.key === "string" ? row.key.trim() : ""
    if (key === "") continue
    const entry: LogbookEntry = { key }
    for (const field of ["call", "name", "checked"] as const) {
      if (typeof row[field] === "string" && row[field] !== "") entry[field] = row[field]
    }
    entries.push(entry)
  }
  return entries
}

/// The operator's logbook keys, or undefined when the keychain could not be
/// read, which is not the same as none entered.
export function logbookEntriesOf(ctx: HookContext): LogbookEntry[] | undefined {
  return ctx.keychain === undefined ? undefined : entriesIn(ctx.keychain[LOGBOOKS])
}

const isChecked = (entry: LogbookEntry) => entry.checked === entry.key && entry.call !== undefined

/// STATUS answers, by key, for this runtime: a key is checked as the form
/// validates it and again as it transforms it, one right after the other.
const statuses = new Map<string, Promise<Logbook>>()

function statusOf(key: string): Promise<Logbook> {
  let status = statuses.get(key)
  if (!status) {
    status = logbookStatus(key)
    statuses.set(key, status)
    status.catch(() => statuses.delete(key))
  }
  return status
}

export const logbookSettingsPanel: DynamicSettingsPanel = {
  kind: "dynamic",
  async getPanels(_args, ctx) {
    // The push these keys are for is the app's PUSH experiment; without it
    // the app asks no transfer hook anything, and the panel would configure
    // nothing.
    if (!(ctx.enabledExperiments ?? []).includes("push")) return []
    return [{ key: manifest.key, title: tFor(ctx)("logbookPanelTitle"), icon: "cloud-upload-outline", section: "exports", sidebar: false }]
  },
  async getDefinition(_args, ctx): Promise<FormDefinition> {
    const t = tFor(ctx)
    // The QRZ.com login the pushes sign in with, opening its own dialog.
    const account: FormElement = { type: "field", fieldType: "account", key: "account", label: t("accountLabel"), account: { key: manifest.key } }
    const entries = logbookEntriesOf(ctx)
    // Without the stored list, an empty one shown here would be saved over it.
    if (entries === undefined) return { elements: [account, { type: "markdown", text: t("keychainUnavailable") }] }
    return {
      elements: [
        account,
        // An inline list shows neither its label nor its description.
        { type: "header", style: "section", key: LOGBOOKS, title: t("logbooksLabel") },
        { type: "markdown", text: t("logbookKeysHelp") },
        {
          type: "field",
          fieldType: "list",
          key: LOGBOOKS,
          label: t("logbooksLabel"),
          // The logbooks are this panel's content: their rows go in it, not in a dialog of their own.
          inline: true,
          itemLabel: t("logbookItemLabel"),
          itemTitle: "${title}",
          value: entries.map((entry) => ({ ...entry, title: entry.call ? logbookLabel({ call: entry.call, name: entry.name }, t) : shortKey(entry.key) })),
          itemFields: [{ type: "field", fieldType: "secret", key: "key", label: t("logbookKeyLabel") }],
        },
      ],
    }
  },
  async validateField({ fieldKey, value }, ctx) {
    if (fieldKey !== LOGBOOKS) return null
    for (const entry of entriesIn(value).filter((entry) => !isChecked(entry))) {
      try {
        await statusOf(entry.key)
      } catch (e) {
        return statusFailure(entry.key, e, tFor(ctx))
      }
    }
    return null
  },
  async transformField({ fieldKey, value }) {
    if (fieldKey !== LOGBOOKS) return value
    return Promise.all(
      entriesIn(value).map(async (entry) => {
        if (isChecked(entry)) return entry
        const { call, name } = await statusOf(entry.key)
        return name ? { key: entry.key, call, name, checked: entry.key } : { key: entry.key, call, checked: entry.key }
      }),
    )
  },
  async onChangeField({ fieldKey, value }) {
    if (fieldKey !== LOGBOOKS) return
    await host.keychainSet(LOGBOOKS, entriesIn(value) as unknown as JSONValue)
  },
}
