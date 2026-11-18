// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// What the published `@ham2k/extension-sdk` (API 25) does not describe yet.
//
// `ctx.getScores(operationUuid)` is the operation's score as the app keeps it:
// each scorer's tallies for the whole operation, by scorer key (a contest's
// is its extension's key), the same `operationSummary` its `scoring` hook
// answered. It is planned for extension API 28; until a host has it, the
// method is absent and nothing is posted. Delete this file the day the SDK
// publishes it.

import type { HookContext, ScoreTally } from "@ham2k/extension-sdk"

export type ScoresByScorer = Record<string, Record<string, ScoreTally>>

export type ScoresContext = HookContext & {
  getScores?(operationUuid: string): Promise<ScoresByScorer | null>
}
