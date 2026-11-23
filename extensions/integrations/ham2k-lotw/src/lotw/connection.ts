// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import type { HookContext } from '@ham2k/extension-sdk'
import { createLotwAccountHook, type LotwAccountPorts, loadLotwAccountFor } from './account.ts'
import { createLotwHostAdapters, type LotwHostPorts } from './host.ts'
import type { LotwSigningPort } from './signing.ts'
import type { LotwTransferConnection } from './transfer.ts'

export interface LotwConnectionPorts {
  host?: LotwHostPorts
  // The provider validates the P12, matching private key and certificate
  // dates. Its signer uses only the supplied secure entropy.
  loadCertificate(
    p12: Uint8Array,
    password: string,
    ctx: HookContext,
    randomBytes: LotwHostPorts['randomBytes'],
  ): Promise<LotwSigningPort>
  checkCertificateStatus?: LotwAccountPorts['checkCertificateStatus']
  checkPlatform?: LotwAccountPorts['checkPlatform']
  realNowMillis(): number
}

/** Compose the API 29 host APIs with a certificate signing provider. */
export function createLotwConnection(ports: LotwConnectionPorts) {
  const adapters = createLotwHostAdapters(ports.host)
  const accountPorts: LotwAccountPorts = {
    loadCertificate: (p12, password, ctx) =>
      ports.loadCertificate(p12, password, ctx, adapters.randomBytes),
    checkCertificateStatus: ports.checkCertificateStatus,
    checkPlatform: ports.checkPlatform,
  }
  return {
    account: createLotwAccountHook(accountPorts),
    async connect(ctx: HookContext, stationCall?: string): Promise<LotwTransferConnection> {
      return {
        signing: await loadLotwAccountFor(ctx.account?.credentials, ctx, accountPorts, stationCall),
        transport: adapters.transport,
        realNowMillis: () => ports.realNowMillis(),
      }
    },
  }
}
