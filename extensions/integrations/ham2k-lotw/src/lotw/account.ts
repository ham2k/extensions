// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import {
  type AccountHook,
  base64ToBytes as decodeBase64,
  type HookContext,
} from '@ham2k/extension-sdk'
import type { LotwCertificateStatus } from './certificate-status.ts'
import type { LotwSigningPort } from './signing.ts'

export const maxLotwCertificateBytes = 64 * 1024

/**
 * The certificates one account holds: an operator with several callsigns has
 * one TQSL certificate for each.
 */
export const lotwCertificateSlots = [
  { file: 'certificate', password: 'certificatePassword', ordinal: '' },
  { file: 'certificate2', password: 'certificate2Password', ordinal: 'second ' },
  { file: 'certificate3', password: 'certificate3Password', ordinal: 'third ' },
] as const

export type LotwCertificateSlot = (typeof lotwCertificateSlots)[number]

/** The slots the operator chose a file for, in order. */
export function filledLotwSlots(
  credentials: Record<string, string> | undefined,
): LotwCertificateSlot[] {
  return lotwCertificateSlots.filter((slot) => !!credentials?.[slot.file])
}

export interface LotwAccountPorts {
  base64ToBytes?: typeof decodeBase64
  // Parse/decrypt the P12 and validate the certificate and its matching key.
  // Only the provider owns that key; callers receive its signing capability.
  loadCertificate(p12: Uint8Array, password: string, ctx: HookContext): Promise<LotwSigningPort>
  checkCertificateStatus?(serial: string, ctx: HookContext): Promise<LotwCertificateStatus>
  // Throws, with the operator's message, where signing must not run.
  checkPlatform?(): Promise<void>
}

export interface LotwAccountCredentials {
  p12: Uint8Array
  password: string
}

const invalidFor = (slot: LotwCertificateSlot) =>
  `Could not open the ${slot.ordinal}LoTW certificate. Check the file and its password.`
const invalid = invalidFor(lotwCertificateSlots[0])
const maxEncodedLength = 4 * Math.ceil(maxLotwCertificateBytes / 3)
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const fileProblems = {
  password: (ordinal: string) =>
    `The password does not open the ${ordinal}LoTW certificate. Enter the one you set when you saved it from TQSL.`,
  noKey: (ordinal: string) =>
    `The ${ordinal}LoTW certificate file holds no private key, so it cannot sign. Save the callsign certificate from TQSL again and choose that file.`,
  notLotw: (ordinal: string) =>
    `The ${ordinal}LoTW certificate file is not a TQSL callsign certificate. Choose the .p12 file you saved from TQSL.`,
}

/**
 * A certificate file that will not open for a reason the operator can act
 * on. Its kind selects a fixed message: the parser's own words can carry
 * private material, so they never reach the operator.
 */
export class LotwCertificateFileProblem extends Error {
  readonly kind: keyof typeof fileProblems
  constructor(kind: keyof typeof fileProblems) {
    super(kind)
    this.kind = kind
  }
}

/** The operator's message for a certificate in `slot` that failed to open. */
export function certificateOpenMessage(error: unknown, slot: LotwCertificateSlot): string {
  return error instanceof LotwCertificateFileProblem
    ? fileProblems[error.kind](slot.ordinal)
    : invalidFor(slot)
}

const certificateName = (call?: string) => (call ? `the certificate for ${call}` : 'this certificate')
const accountProblems = {
  missing: () => 'Choose a LoTW certificate file (.p12) in the LoTW account settings first.',
  validity: () =>
    'The LoTW certificate is outside its validity dates. Check your clock and certificate.',
  expired: (call?: string, date?: string) =>
    `The LoTW certificate for ${call} expired on ${date}. Renew it in TQSL, then choose the new .p12 file.`,
  notYetValid: (call?: string, date?: string) =>
    `The LoTW certificate for ${call} is valid only from ${date}. Check this device’s date and time.`,
  revoked: (call?: string) =>
    `LoTW reports ${certificateName(call)} was revoked. Choose a current .p12 file.`,
  superseded: (call?: string) =>
    `LoTW reports ${certificateName(call)} was replaced. Choose the latest .p12 file.`,
}

/** Two slots for one callsign: which certificate signs would be a guess. */
export const duplicateCertificates = (call: string) =>
  `Two of the LoTW certificates are for ${call}. Keep only the latest one.`

/** Only fixed, operator-facing messages may pass through the credential error boundary. */
export class LotwAccountProblem extends Error {
  constructor(problem: keyof typeof accountProblems, call?: string, date?: string) {
    super(accountProblems[problem](call, date))
  }
}

function decodedLength(encoded: string): number {
  if (
    encoded.length === 0 ||
    encoded.length > maxEncodedLength ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new Error(invalid)
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const length = (encoded.length / 4) * 3 - padding
  // Check unused bits as well as shape: there is one canonical encoding for
  // these bytes. The actual decoder remains the SDK's, never a local codec.
  const trailing = alphabet.indexOf(encoded[encoded.length - padding - 1])
  if (
    length < 1 ||
    length > maxLotwCertificateBytes ||
    (padding === 2 && (trailing & 15) !== 0) ||
    (padding === 1 && (trailing & 3) !== 0)
  ) {
    throw new Error(invalid)
  }
  return length
}

/** Read only the host's secure account credentials, never settings or filenames. */
export function readLotwAccountCredentials(
  credentials: Record<string, string> | undefined,
  base64ToBytes = decodeBase64,
  slot: LotwCertificateSlot = lotwCertificateSlots[0],
): LotwAccountCredentials {
  try {
    const encoded = credentials?.[slot.file]
    const password = credentials?.[slot.password] ?? ''
    if (typeof encoded !== 'string' || typeof password !== 'string') throw new Error(invalid)
    const expectedLength = decodedLength(encoded)
    const p12 = base64ToBytes(encoded)
    if (!(p12 instanceof Uint8Array) || p12.length !== expectedLength) throw new Error(invalid)
    return { p12, password }
  } catch {
    // Decoder errors may contain the credential value. Never surface them.
    throw new Error(invalidFor(slot))
  }
}

function certificateIdentity(
  signing: LotwSigningPort,
  slot: LotwCertificateSlot = lotwCertificateSlots[0],
): string {
  const call = signing.certificate.callsign
  if (
    typeof call !== 'string' ||
    !/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(call) ||
    !/[A-Z]/.test(call) ||
    !/\d/.test(call) ||
    call.length < 3 ||
    call.length > 20 ||
    typeof signing.signSha1 !== 'function' ||
    typeof signing.gzip !== 'function'
  ) {
    throw new Error(invalidFor(slot))
  }
  return call
}

/** Open a fresh signing capability from the current secure account value. */
export async function loadLotwAccount(
  credentials: Record<string, string> | undefined,
  ctx: HookContext,
  ports: LotwAccountPorts,
  slot: LotwCertificateSlot = lotwCertificateSlots[0],
): Promise<LotwSigningPort> {
  try {
    const { p12, password } = readLotwAccountCredentials(credentials, ports.base64ToBytes, slot)
    const signing = await ports.loadCertificate(p12, password, ctx)
    certificateIdentity(signing, slot)
    return signing
  } catch (error) {
    // Parser/password/key errors can include private material or filenames.
    if (error instanceof LotwAccountProblem) throw error
    throw new Error(certificateOpenMessage(error, slot))
  }
}

/**
 * The certificate for `stationCall`, or the first one when no call is named.
 * Slots are opened in order and the search stops at the match, so a broken
 * certificate for another callsign does not stop this one's uploads; it is
 * reported only when no slot matches.
 */
export async function loadLotwAccountFor(
  credentials: Record<string, string> | undefined,
  ctx: HookContext,
  ports: LotwAccountPorts,
  stationCall?: string,
): Promise<LotwSigningPort> {
  const slots = filledLotwSlots(credentials)
  if (slots.length === 0) return loadLotwAccount(credentials, ctx, ports)
  let failure: unknown
  for (const slot of slots) {
    try {
      const signing = await loadLotwAccount(credentials, ctx, ports, slot)
      if (stationCall === undefined || signing.certificate.callsign === stationCall) return signing
    } catch (error) {
      failure ??= error
    }
  }
  if (failure !== undefined) throw failure
  throw new Error(`None of the LoTW certificates is for ${stationCall}.`)
}

const certificateFields = lotwCertificateSlots.flatMap((slot, index) => [
  {
    key: slot.file,
    label: index === 0 ? 'LoTW certificate file (.p12)' : `Certificate ${index + 1} (.p12)`,
    type: 'file' as const,
    accept: { extensions: ['p12'] },
    maxBytes: maxLotwCertificateBytes,
  },
  {
    key: slot.password,
    label:
      index === 0
        ? 'Certificate file password (if set)'
        : `Certificate ${index + 1} password (if set)`,
    type: 'secret' as const,
  },
])

// In order of precedence: offline explains every other lookup too.
const uncheckedReasons = {
  offline: 'this device is offline',
  unreachable: 'LoTW did not answer',
  unreadable: 'LoTW’s answer was not a certificate status',
}

/** Why this platform cannot hold a certificate, or undefined where it can. */
async function platformRefusal(ports: LotwAccountPorts): Promise<string | undefined> {
  try {
    await ports.checkPlatform?.()
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function createLotwAccountHook(ports: LotwAccountPorts): AccountHook {
  return {
    label: 'Logbook of the World',
    description: async () =>
      (await platformRefusal(ports)) ??
      'Choose the certificate files (.p12) you saved from TQSL, one for each callsign you upload as.',
    synchronizable: false,
    // Save stores whatever the fields hold without a Test, so a platform
    // that must not hold a signing key is offered no field to put one in.
    fields: async () => ((await platformRefusal(ports)) === undefined ? certificateFields : []),
    async testCredentials(credentials, ctx) {
      await ports.checkPlatform?.()
      const slots = filledLotwSlots(credentials)
      if (slots.length === 0) {
        // The first slot's own message: no file chosen reads as one that will not open.
        await loadLotwAccount(credentials, ctx, ports)
      }
      const opened: { call: string; serial: string }[] = []
      for (const slot of slots) {
        const signing = await loadLotwAccount(credentials, ctx, ports, slot)
        const call = certificateIdentity(signing, slot)
        if (opened.some((certificate) => certificate.call === call)) {
          throw new Error(duplicateCertificates(call))
        }
        opened.push({ call, serial: signing.certificate.serial })
      }
      // Each lookup may wait out its own timeout, and the host gives Test
      // ten seconds in all: one after another, three would not fit.
      const statuses = await Promise.all(
        opened.map(({ serial }) => ports.checkCertificateStatus?.(serial, ctx)),
      )
      opened.forEach(({ call }, index) => {
        const status = statuses[index]
        if (status === 'revoked' || status === 'superseded') {
          throw new LotwAccountProblem(status, call)
        }
      })
      const calls = opened.map(({ call }) => call)
      const list = calls.join(', ')
      const unchecked = (Object.keys(uncheckedReasons) as (keyof typeof uncheckedReasons)[]).find(
        (status) => statuses.includes(status),
      )
      if (unchecked) {
        return `Certificate file${calls.length > 1 ? 's' : ''} for ${list} opened. LoTW certificate status could not be checked: ${uncheckedReasons[unchecked]}.`
      }
      return calls.length > 1
        ? `Certificates for ${list} are ready.`
        : `Certificate for ${list} is ready.`
    },
  }
}
