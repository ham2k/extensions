// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// COPIES of `@ham2k/extension-sdk` types (extension API 31) the published
// package does not carry yet: a `transfer` hook's `pull`. Nothing here may
// diverge from the SDK's own. `sdkGap` is the name to grep for: this file
// deletes, and its imports move to the SDK, the day the SDK publishes them.

import type { TransferDestination } from "@ham2k/extension-sdk"

export interface PullRequest {
  service: string
  destination: TransferDestination
  cursor?: string
}

export interface PullResult {
  format: "adif"
  content: string
  cursor?: string
  idField?: string
}
