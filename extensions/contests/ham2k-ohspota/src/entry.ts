// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What we declared about our own station: the power class and the entry
// category, both of which the sponsor's log checker reads from the Cabrillo
// header. Neither changes the score.
//
// The fields are `ourPower` and `ourCategory`, the names the combined extension
// stored them under, so an operation set up there keeps both. A value the
// sponsor does not publish is refused: that extension shared one ref between
// four events, and a Texas `QRP` must not become an Ohio header.

import type { JSONValue } from "@ham2k/extension-sdk"

import { CATEGORIES, POWER_CLASSES, type EntryCategory } from "./event.ts"

function upper(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value.toUpperCase() : ''
}

export function declaredPower(ref: Record<string, JSONValue> | undefined): string {
  const value = upper(ref?.ourPower)
  return POWER_CLASSES.some((power) => power.value === value) ? value : ''
}

export function declaredCategory(ref: Record<string, JSONValue> | undefined): EntryCategory | undefined {
  const value = upper(ref?.ourCategory)
  return CATEGORIES.find((category) => category.value === value)
}

/// `CATEGORY-POWER`: the entry category's own power where the category names one
/// — six of the nine do — else the class we declared, else nothing, which the
/// Cabrillo writer drops.
export function cabrilloPower(ref: Record<string, JSONValue> | undefined): string {
  const category = declaredCategory(ref)
  if (category?.power) return category.power
  const power = declaredPower(ref)
  if (!power) return ''
  return power === 'HP' ? 'HIGH' : 'LOW'
}
