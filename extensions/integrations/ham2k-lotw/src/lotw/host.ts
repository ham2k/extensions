// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import { host as sdkHost } from '@ham2k/extension-sdk'
import {
  LotwNotSentError,
  type LotwUploadRequest,
  type LotwUploadTransport,
  LotwUploadTransportError,
} from './upload.ts'

export type LotwHostPorts = Pick<typeof sdkHost, 'randomBytes' | 'fetch'> &
  Partial<Pick<typeof sdkHost, 'getVersionInfo'>>

export const maxLotwRequestBytes = 16 * 1024 * 1024
const maxRandomBytes = 4096
const endpoint = 'https://lotw.arrl.org/lotw/upload'
const entropyFailure = 'Secure randomness is unavailable for LoTW signing.'
const invalidRequest = 'Could not prepare the LoTW upload request, so nothing was sent.'

function uploadFailureDetail(error: unknown): string {
  // HaLo passes fetch exceptions across the bridge as text. Recognize its
  // known forms without passing through text that may contain private data.
  const message = error instanceof Error ? error.message : ''
  if (/^TimeoutException(?: after [\d:.]+)?:/.test(message)) return 'Request timed out'
  const redirect = /^ExtensionHostException: fetch refused: 'lotw\.arrl\.org' answered (301|302|303|307|308), and the request does not follow redirects$/.exec(
    message,
  )
  if (redirect) return `Redirect refused (HTTP ${redirect[1]})`
  if (/^ClientException(?::| with )/.test(message)) return 'Network request failed'
  return 'Upload request failed'
}

function validateRequest(request: LotwUploadRequest): void {
  if (
    request.url !== endpoint ||
    request.method !== 'POST' ||
    request.redirect !== 'error' ||
    !(request.body instanceof Uint8Array) ||
    request.body.byteLength > maxLotwRequestBytes ||
    !Number.isFinite(request.timeout) ||
    request.timeout <= 0 ||
    typeof request.headers?.['Content-Type'] !== 'string' ||
    !request.headers['Content-Type'].trim()
  ) {
    throw new Error(invalidRequest)
  }
}

/** Prepare SDK adapters without storing keys or doing work on creation. */
export function createLotwHostAdapters(host: LotwHostPorts = sdkHost): {
  randomBytes(length: number): Promise<Uint8Array>
  transport: LotwUploadTransport
} {
  return {
    async randomBytes(length) {
      if (!Number.isInteger(length) || length < 1 || length > maxRandomBytes) {
        throw new Error(entropyFailure)
      }
      try {
        const bytes = await host.randomBytes(length)
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) {
          throw new Error(entropyFailure)
        }
        return bytes
      } catch {
        // Never expose provider errors or fall back to a weaker source.
        throw new Error(entropyFailure)
      }
    },
    async transport(request) {
      try {
        validateRequest(request)
      } catch {
        throw new LotwNotSentError(invalidRequest)
      }
      try {
        // The host owns browser proxy routing and the trusted fetch dispatch.
        // Passing the byte view unchanged preserves only the selected slice.
        return await host.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': request.headers['Content-Type'] },
          body: request.body,
          redirect: 'error',
          timeout: request.timeout,
        })
      } catch (error) {
        // A redirect or a lost reply may follow delivery. The caller decides
        // what to do with an uncertain result; this adapter never retries.
        throw new LotwUploadTransportError(uploadFailureDetail(error))
      }
    },
  }
}
