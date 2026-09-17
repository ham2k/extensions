// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// COPIES of things `@ham2k/extension-sdk` has but 0.2.0 does not yet export.
//
// The app's own extensions build against the SDK's SOURCE, so they reach
// anything it declares; a catalog extension builds against the PUBLISHED
// package and can only reach its barrel. A symbol on one side and not the
// other lands here rather than being worked around, so that the next SDK
// release turns forty scattered workarounds into one deletion: `sdkGap.ts` is
// the name to grep for.
//
// Nothing here may DIVERGE. Each copy is the SDK's own implementation,
// verbatim, and a rule that behaves differently in a published extension than
// in the app's built-in one is the exact failure this file trades bundle size
// to avoid. The one thing that is not a copy is `withRefInput`, which stands
// in for the `transforms` and `refInput` options the SDK's `referenceActivity`
// takes since the app's copy of it gained them — the published factory takes
// neither, so the same descriptors are shaped after it has built them.

import { annotateCallAgainstCountryFile, regionAndCountryForDxccCode } from "@ham2k/extension-sdk"

import type { HookContext, JSONValue } from "@ham2k/extension-sdk"

/// One pass of `RefListInputDescriptor.transforms` (the SDK's types.ts): a
/// regex source, a replacement with braced `${n}` group placeholders, and
/// JS-style flags. `RefTransform` in the SDK's refTransforms.ts.
export type RefTransform = { pattern: string; replacement: string; flags?: string }

/// `RefInputArgs` / `RefInputExtras` in the SDK's referenceActivity.ts: `side`
/// says which control is being built — the hunting control follows the OTHER
/// station's entity (that of the QSO's callsign) and the activation control
/// our own, app-polo's hunter/activator rule.
export interface RefInputArgs {
  operation: Record<string, JSONValue>
  qso?: Record<string, JSONValue>
  side: 'activation' | 'hunting'
}

export interface RefInputExtras {
  placeholder?: string
  transforms?: RefTransform[]
}

type ControlArgs = { operation: Record<string, JSONValue>; qso?: Record<string, JSONValue> }
type ControlsMethod = (args: ControlArgs, ctx: HookContext) => Promise<any[]>

/// The factory's `refInput` option, applied from outside: every `refList`
/// control the factory's `operationControls` and `loggingControls` answer
/// gets the placeholder and transforms [refInput] resolves for that side,
/// falling back to what the factory put there. Delete this, and pass
/// `refInput` (or `transforms`) to `referenceActivity` instead, once the
/// published SDK takes them.
export function withRefInput(
  activityHook: Record<string, unknown>,
  refInput: (args: RefInputArgs, ctx: HookContext) => Promise<RefInputExtras> | RefInputExtras,
): Record<string, unknown> {
  const shaped = (method: string, side: RefInputArgs['side']) => {
    const original = activityHook[method] as ControlsMethod | undefined
    if (!original) return {}
    return {
      [method]: async (args: ControlArgs, ctx: HookContext) => {
        const controls = await original(args, ctx)
        const extras = await refInput({ operation: args.operation, qso: side === 'hunting' ? args.qso : undefined, side }, ctx)
        return controls.map((control) =>
          control?.input?.kind === 'refList'
            ? {
                ...control,
                input: {
                  ...control.input,
                  placeholder: extras.placeholder ?? control.input.placeholder,
                  transforms: extras.transforms ?? control.input.transforms,
                },
              }
            : control,
        )
      },
    }
  }
  return { ...activityHook, ...shaped('operationControls', 'activation'), ...shaped('loggingControls', 'hunting') }
}

/// `countryPrefixForCall` in the SDK's dxcc.ts: the real-world country a
/// callsign's entity sits in, as an uppercase ISO 3166 code — the prefix POTA
/// ("US-1234") and LLOTA ("LLUS-0001") build their references from, which is
/// NOT the ham-radio DXCC entity: Hawaii is its own entity ("KH6") but its
/// parks are "US-"; a Canadian call's entity prefix is "VE" but its parks are
/// "CA-"; an EA3 call's is "EA" but Spain's are "ES-". `@ham2k/lib-dxcc-data`'s
/// `countryCode` carries that mapping; the handful of entities without one
/// (mostly long-deleted) fall back to the entity prefix itself.
export function countryPrefixForCall(call: string | undefined): string | undefined {
  if (!call) return undefined
  const annotated = annotateCallAgainstCountryFile(call)
  const { countryCode } = regionAndCountryForDxccCode(annotated.dxccCode)
  return countryCode ? countryCode.toUpperCase() : annotated.entityPrefix
}

/// `transformsForPrefix` in the SDK's refTransforms.ts: live-typing
/// reformatting for the (possibly comma/space-separated list of) reference(s)
/// in one chip's field, e.g. "us1234 us5678" -> "US-1234,US-5678" — mirrors
/// app-polo's POTAInput.jsx textTransformer chain, but declared once per
/// loggingControls/operationControls call (with `prefix` baked in from the
/// QSO's guessed DXCC entity) instead of run in the runtime on every
/// keystroke; the core's native input widget applies this list, in order, on
/// every keystroke.
export function transformsForPrefix(prefix: string): RefTransform[] {
  return [
    // a run of spaces between two refs -> ", " (normalize to one separator style)
    { pattern: '([A-Z0-9]-\\d+|TEST) +(?=[A-Z0-9])', replacement: '${1}, ', flags: 'gi' },
    // bare number (or "TEST"), at the start or right after a separator -> prefix-number
    // (the separator itself is captured and replayed, not consumed, so a
    // pasted "US-1234,5678" keeps its comma instead of merging into one ref).
    // Braced `${1}`/`${2}`, not bare `$1`/`$2` — `prefix` can itself start
    // with a digit (e.g. DXCC "3D2" for Fiji), and a bare "$1" immediately
    // followed by that would misparse as capture group 13.
    { pattern: '(^|,\\s*)(\\d\\d+|TEST)', replacement: `\${1}${prefix}-\${2}`, flags: 'gi' },
    // "US1234" -> "US-1234". Anchored with a negative lookbehind so it only
    // fires at the START of a not-yet-dashed reference — without it, a
    // multi-character DXCC prefix that mixes letters and digits (e.g.
    // Fiji's "3D2") gets its OWN internal "D2" mismatched as an undashed
    // reference once transform 2 above has already inserted "3D2-1234",
    // corrupting it into "3D-2-1234".
    { pattern: '(?<![A-Z0-9])([A-Z]+)(\\d+|TEST)', replacement: '${1}-${2}', flags: 'gi' },
    // NOTE: deliberately no "eagerly insert the next prefix right after a
    // trailing comma" rule here (app-polo's inputs have one) — transform 2
    // above already prefixes a second reference once 2+ digits appear after
    // the comma, the same way it does at the start of the field. An eager
    // version that inserted "US-" the instant a trailing comma appeared
    // makes deleting back through a second reference impossible: backspacing
    // "US-1234,US-5678" down to "US-1234,US-" and then to "US-1234," would
    // immediately re-grow the trailing "US-1234,US-" the transform had just
    // reinserted, so the comma itself could never be reached.

    // strip anything that can't appear in a reference list
    { pattern: '[^A-Z0-9\\-, ]', replacement: '', flags: 'gi' },
  ]
}
