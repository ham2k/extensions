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
