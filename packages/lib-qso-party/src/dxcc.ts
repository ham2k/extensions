// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The country file, behind a seam.
//
// The lookup itself is the host's, reached through `@ham2k/extension-sdk`. A
// module that imports a RUNTIME value from the SDK cannot be loaded by
// `node --test`: the published bundle imports its own modules without a file
// extension, which node's ESM resolver refuses, and the country file's own
// libraries are the host's as well. The scorer, the exchange and everything the
// tests are written against therefore reach the lookup through here, and
// `index.ts` — the entry every extension loads, and the one module that already
// depends on the SDK at runtime — registers the real one.
//
// With nothing registered the lookup answers nothing, which is the honest
// fallback rather than a silent wrong one: a station whose entity we cannot
// determine and whose exchange was never typed is a QSO we cannot place.

type EntityLookup = (call: string | undefined) => string | undefined

let lookup: EntityLookup | undefined

export function registerEntityLookup(fn: EntityLookup): void {
  lookup = fn
}

/// The DXCC entity prefix a callsign belongs to, or `''` where the country file
/// cannot say — or has not been registered.
export function entityPrefixForCall(call: string): string {
  return lookup?.(call) ?? ''
}
