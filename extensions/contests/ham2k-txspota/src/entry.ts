// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What we declared about our own station: the power class, which is a term in
// the score (§6.3.4, §6.5). The operating classes of §5 are claimed on the
// sponsor's form and reach nothing this produces, so they are not asked.

import type { JSONValue } from "@ham2k/extension-sdk"

import { POWER_CLASSES } from "./event.ts"

/// The power class on [ref], if it is one the sponsor publishes. The field is
/// `ourPower`, the name the combined extension stored it under, so an operation
/// set up there keeps its class.
export function declaredPower(ref: Record<string, JSONValue> | undefined): string {
  const value = typeof ref?.ourPower === 'string' ? ref.ourPower.toUpperCase() : ''
  return POWER_CLASSES.some((power) => power.value === value) ? value : ''
}

/// What our power class ADDS to the multiplier sum, and 0 for a class never
/// chosen.
///
/// Zero rather than HIGH's one deliberately. A power class is a claim about how
/// we operated, and an unanswered question claims nothing — the scoreboard then
/// says so by being a multiplier short, which is how the operator finds the
/// field.
export function powerTerm(ref: Record<string, JSONValue> | undefined): number {
  const declared = declaredPower(ref)
  return POWER_CLASSES.find((power) => power.value === declared)?.adds ?? 0
}
