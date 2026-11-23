// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import { type HookContext, host as sdkHost } from '@ham2k/extension-sdk'
import { gzipSync, strToU8 } from 'fflate/browser'
import {
  certificateOpenMessage,
  duplicateCertificates,
  filledLotwSlots,
  LotwAccountProblem,
  readLotwAccountCredentials,
} from './account.ts'
import { openLotwCertificate } from './certificate.ts'
import { checkLotwCertificateStatus } from './certificate-status.ts'
import { createLotwConnection } from './connection.ts'
import type { LotwHostPorts } from './host.ts'
import type { LotwCertificate } from './signing.ts'

const isoDate = (millis: number) => new Date(millis).toISOString().slice(0, 10)

function checkCertificateDates(
  certificate: Pick<LotwCertificate, 'callsign' | 'validFromMillis' | 'validToMillis'>,
  now: number,
): void {
  if (!Number.isFinite(now)) throw new LotwAccountProblem('validity')
  if (now > certificate.validToMillis) {
    throw new LotwAccountProblem('expired', certificate.callsign, isoDate(certificate.validToMillis))
  }
  if (now < certificate.validFromMillis) {
    throw new LotwAccountProblem(
      'notYetValid',
      certificate.callsign,
      isoDate(certificate.validFromMillis),
    )
  }
}

function requireStoredCertificate(ctx: HookContext): Record<string, string> {
  const credentials = ctx.account?.credentials
  if (!credentials || filledLotwSlots(credentials).length === 0) {
    throw new LotwAccountProblem('missing')
  }
  return credentials
}

// The web build keeps account credentials, and the key that unlocks them,
// in the browser's own storage: a signing key does not go there. LoTW's
// status lookup also sends no CORS headers, so a web Test could not check it.
const webRefusal = 'LoTW uploads need the desktop or mobile app. On the web, upload with TQSL.'

async function onWeb(host: LotwHostPorts): Promise<boolean> {
  return (await host.getVersionInfo?.())?.platform === 'web'
}

export function createLotwRuntimeConnection({
  host = sdkHost,
  realNowMillis = Date.now,
}: {
  host?: LotwHostPorts
  realNowMillis?: () => number
} = {}) {
  const connection = createLotwConnection({
    host,
    realNowMillis,
    async loadCertificate(p12, password, _ctx, randomBytes) {
      const opened = openLotwCertificate(p12, password)
      checkCertificateDates(opened.certificate, realNowMillis())
      return {
        certificate: opened.certificate,
        signSha1: (text) => opened.signSha1(text, randomBytes),
        async gzip(text) {
          return gzipSync(strToU8(text), { mtime: 0 })
        },
      }
    },
    async checkPlatform() {
      if (await onWeb(host)) throw new Error(webRefusal)
    },
    async checkCertificateStatus(serial, ctx) {
      if (!ctx.online) return 'offline'
      return checkLotwCertificateStatus(serial, (url, options) => host.fetch(url, options))
    },
  })
  return {
    account: connection.account,
    async available() {
      return !(await onWeb(host))
    },
    stationCalls(ctx: HookContext) {
      // Resolve the callsigns locally as Exports refreshes. Only Account Test
      // requests certificate status from LoTW. A certificate that will not
      // open, or is out of date, offers nothing and does not stop the
      // others; its failure goes back with them. Two for one callsign stop
      // them all: which one would sign is a guess, and the older may be
      // replaced.
      const credentials = requireStoredCertificate(ctx)
      const calls: string[] = []
      let failure: unknown
      for (const slot of filledLotwSlots(credentials)) {
        try {
          const { p12, password } = readLotwAccountCredentials(credentials, undefined, slot)
          let opened: ReturnType<typeof openLotwCertificate>
          try {
            opened = openLotwCertificate(p12, password)
          } catch (error) {
            throw new Error(certificateOpenMessage(error, slot))
          }
          checkCertificateDates(opened.certificate, realNowMillis())
          calls.push(opened.certificate.callsign)
        } catch (error) {
          failure ??= error
        }
      }
      const duplicate = calls.find((call, index) => calls.indexOf(call) !== index)
      if (duplicate !== undefined) throw new Error(duplicateCertificates(duplicate))
      return { calls, failure }
    },
    async connect(ctx: HookContext, stationCall?: string) {
      requireStoredCertificate(ctx)
      return connection.connect(ctx, stationCall)
    },
  }
}
