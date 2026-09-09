// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// A copy of the SDK's own `src/dxcc.ts` annotation entry point, because the
// published `@ham2k/extension-sdk` 0.2.0 predates the `wae` option and its
// exported `annotateCallAgainstCountryFile` takes the callsign alone. R1 Field
// Day scores by WAE country, so calling the barrel's version would resolve
// European Turkey as Asia and quietly lose a multiplier.
//
// Nothing here may diverge from that file; it is a copy, not a fork, and it
// goes away when the SDK publishes the option. The manifest's
// `@ham2k/lib-country-files` floor is this extension's alone and raised for
// the same reason: the WAE tables the option reads are not in every 1.0.

import { parseCallsign } from "@ham2k/lib-callsigns"
import { annotateFromCountryFile, useBuiltinCountryFile } from "@ham2k/lib-country-files"
import type { AnnotatedCallInfo } from "@ham2k/lib-country-files"

// Loads the bundled BIGCTY data once per runtime activation — self-contained,
// no network — so DXCC entity resolution works without relying on a
// callsign already having been enriched by a lookup hook. The SDK's own copy
// does the same on import; the call only assigns, so both running is harmless.
useBuiltinCountryFile()

/// Parses and resolves a callsign's DXCC entity against the bundled country
/// file. No network access.
///
/// `wae: true` resolves against the WAE country list instead: the extra
/// entities carry starred prefixes (`*IT9`, `*TA1`, `*4U1V`) and their WAE
/// continent — European Turkey is EU there, not AS — which is what a
/// WAE-multiplier contest scores by.
export function annotateCallAgainstCountryFile(call: string, options?: { wae?: boolean }): AnnotatedCallInfo {
  return annotateFromCountryFile(parseCallsign(call), options)
}
