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
// to avoid.

/// Whether [text] is someone typing a reference rather than searching for a
/// name — the rule the SDK's reference-activity factory applies, which the
/// hand-written programs have to apply identically or the same search offers
/// an invented reference in one program and not in another.
///
/// A name is rejected on either count: more than one word, or no digit and no
/// separator anywhere. Both are needed — names carry numbers (`route 66`,
/// `camp 4`), so a digit alone does not make text a code; and a code can be a
/// single bare word, so one word alone does not make it one either.
export function looksLikeReference(text: string, referenceRegex: RegExp): boolean {
  if (referenceRegex.test(text)) return true
  if (/\s/.test(text)) return false
  return /[0-9]/.test(text) || /[-/]/.test(text)
}
