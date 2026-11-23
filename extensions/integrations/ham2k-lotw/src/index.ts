// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import { defineExtension } from '@ham2k/extension-sdk'
import manifest from '../manifest.json' with { type: 'json' }
import { createLotwRuntimeConnection } from './lotw/runtime.ts'
import { createLotwTransferHook } from './lotw/transfer.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    const connection = createLotwRuntimeConnection()
    registerHook('account', { key: manifest.key, hook: connection.account })
    registerHook('transfer', { key: manifest.key, hook: createLotwTransferHook(connection) })
  },
})
