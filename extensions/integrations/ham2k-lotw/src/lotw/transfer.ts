// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
import {
  type DestinationsRequest,
  entityForCall,
  type HookContext,
  isTestOperation,
  type PushRecord,
  type PushRecordResult,
  type PushRequest,
  type PushSuggestionsRequest,
  type TransferHook,
} from '@ham2k/extension-sdk'
import { readTransferAdif } from './adif.ts'
import { lotwScopeSelection } from './scopes.ts'
import {
  buildSignedTq8,
  CANADA,
  checkLotwContact,
  type LotwContact,
  LotwContactProblem,
  type LotwSigningPort,
  type LotwStation,
  shown,
  US_ENTITIES,
} from './signing.ts'
import { LotwNotSentError, type LotwUploadTransport, uploadLotwTq8 } from './upload.ts'

export interface LotwTransferConnection {
  signing: LotwSigningPort
  transport: LotwUploadTransport
  realNowMillis(): number
}

export interface LotwTransferPorts {
  // Resolve the native account and supported transport before doing any
  // work. The extension must not substitute preferences or a text body for
  // missing secure credentials or binary host APIs.
  connect(ctx: HookContext, stationCall?: string): Promise<LotwTransferConnection>
  stationCalls?(ctx: HookContext): string[]
  // False where uploads must not be offered at all.
  available?(): Promise<boolean>
  elapsedNowMillis?(): number
}

interface PreparedContact {
  station: LotwStation
  contact: LotwContact
}

const service = 'lotw'
const chunkSize = 25
// Core stops a chunk at 60 seconds. Keep time for its bridge and write-back,
// and shorten each HTTP timeout as this chunk spends its own budget.
const pushBudgetMillis = 45_000
// Less than this left, and an upload is not started: it would time out
// after LoTW may have taken it, which reads as an uncertain result.
const minimumUploadMillis = 5_000
const invalid = 'Could not prepare the contacts for LoTW. Check their station and log data.'
const unreadable = 'Could not read this contact for LoTW.'
const fieldNames: Record<string, string> = {
  STATION_CALLSIGN: 'station callsign',
  MY_DXCC: 'DXCC entity for its station',
  MY_CQ_ZONE: 'CQ zone',
  MY_ITU_ZONE: 'ITU zone',
  CALL: 'callsign',
  BAND: 'band',
  MODE: 'mode',
  QSO_DATE: 'date',
  TIME_ON: 'time',
}

function required(fields: Record<string, string>, key: string): string {
  const value = fields[key]?.trim().toUpperCase()
  if (!value) throw new LotwContactProblem(`The contact has no ${fieldNames[key] ?? key}.`)
  return value
}

function optional(fields: Record<string, string>, key: string): string | undefined {
  return fields[key]?.trim() ? required(fields, key) : undefined
}

function integer(fields: Record<string, string>, key: string): number {
  const value = required(fields, key)
  if (!/^\d{1,3}$/.test(value)) {
    throw new LotwContactProblem(`LoTW does not take the ${fieldNames[key] ?? key} ${shown(value)}.`)
  }
  return Number(value)
}

function optionalInteger(fields: Record<string, string>, key: string): number | undefined {
  return fields[key]?.trim() ? integer(fields, key) : undefined
}

function prepareAdif(uuid: string, input: string, stationCall: string): PreparedContact {
  const fields = readTransferAdif(input)
  // HaLo's exporter writes UNKNOWN when Chasing or Logs supplies a contact
  // without an operation. TransferService already selected and supplied
  // the destination callsign, and verifyDestination checked its certificate.
  const unknownStationCall = fields.STATION_CALLSIGN === 'UNKNOWN'
  const call = unknownStationCall ? stationCall : required(fields, 'STATION_CALLSIGN')
  if (call !== stationCall) {
    throw new LotwContactProblem(`The contact was logged as ${shown(call)}, not ${stationCall}.`)
  }
  // LoTW needs no grid. AA00 is a placeholder for "no location", not a place.
  const loggedGrid = optional(fields, 'MY_GRIDSQUARE')
  const grid = loggedGrid === 'AA00' || loggedGrid?.startsWith('AA00AA') ? undefined : loggedGrid
  // Restore only the call-derived DXCC field HaLo's exporter would supply.
  // Preserve the logged entity when present so signing checks it against the certificate.
  const dxcc =
    unknownStationCall && fields.MY_DXCC === undefined
      ? entityForCall(stationCall).dxccCode
      : integer(fields, 'MY_DXCC')
  if (dxcc === undefined) {
    throw new LotwContactProblem('The contact has no DXCC entity for its station.')
  }
  // LoTW signs a state only for the USA and Canada, and a county only with
  // its US state. The exporter writes the operation's state for any entity,
  // so elsewhere both are left out rather than refusing the contact.
  const hasSubdivision = US_ENTITIES.includes(dxcc) || dxcc === CANADA
  const state = hasSubdivision ? optional(fields, 'MY_STATE') : undefined
  const qualifiedCounty = state === undefined ? undefined : optional(fields, 'MY_CNTY')
  let county: string | undefined
  if (qualifiedCounty !== undefined) {
    const parts = qualifiedCounty.split(',').map((part) => part.trim())
    if (parts.length !== 2 || parts[0] !== state || !parts[1]) {
      throw new LotwContactProblem(
        `LoTW does not take the county ${shown(qualifiedCounty)} for the state ${state}.`,
      )
    }
    county = parts[1]
  }
  const date = required(fields, 'QSO_DATE')
  const time = required(fields, 'TIME_ON')
  // The core exporter supplies UTC seconds. Do not invent seconds from a
  // four-digit ADIF time, or sign a different contact from the one supplied.
  if (!/^\d{8}$/.test(date)) throw new LotwContactProblem('The contact has no valid date for LoTW.')
  if (!/^\d{6}$/.test(time)) {
    throw new LotwContactProblem('The contact has no exact time, to the second, for LoTW.')
  }
  return {
    station: {
      callsign: call,
      dxcc,
      ...(grid === undefined ? {} : { grid }),
      ...(state === undefined ? {} : { state }),
      ...(county === undefined ? {} : { county }),
      ...(fields.MY_CQ_ZONE === undefined ? {} : { cqZone: optionalInteger(fields, 'MY_CQ_ZONE') }),
      ...(fields.MY_ITU_ZONE === undefined
        ? {}
        : { ituZone: optionalInteger(fields, 'MY_ITU_ZONE') }),
      ...(fields.MY_IOTA === undefined ? {} : { iota: optional(fields, 'MY_IOTA') }),
    },
    contact: {
      id: uuid,
      call: required(fields, 'CALL'),
      band: required(fields, 'BAND'),
      mode: required(fields, 'MODE'),
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      time: `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`,
      ...(fields.SUBMODE === undefined ? {} : { submode: optional(fields, 'SUBMODE') }),
      ...(fields.FREQ === undefined ? {} : { frequencyMHz: optional(fields, 'FREQ') }),
      ...(fields.BAND_RX === undefined ? {} : { bandRx: optional(fields, 'BAND_RX') }),
      ...(fields.FREQ_RX === undefined ? {} : { frequencyRxMHz: optional(fields, 'FREQ_RX') }),
      ...(fields.PROP_MODE === undefined ? {} : { propagation: optional(fields, 'PROP_MODE') }),
      ...(fields.SAT_NAME === undefined ? {} : { satellite: optional(fields, 'SAT_NAME') }),
    },
  }
}

function prepareRecord(record: PushRecord, stationCall: string): PreparedContact {
  if (record.deleted) {
    throw new LotwContactProblem('LoTW keeps no way to remove a contact once uploaded.')
  }
  if (!Array.isArray(record.adif) || record.adif.length === 0 || record.adif.length > 25) {
    throw new Error(unreadable)
  }
  const entries = record.adif.map((adif) => prepareAdif(record.uuid, adif, stationCall))
  const first = entries[0]
  // Program exports may repeat one contact for several references. LoTW
  // receives that contact once; every signed field must agree across them.
  if (entries.some((entry) => JSON.stringify(entry) !== JSON.stringify(first))) {
    throw new LotwContactProblem(
      'The contact’s references disagree on its station or details, so LoTW cannot sign it.',
    )
  }
  return first
}

function verifyDestination(request: PushRequest, connection: LotwTransferConnection): string {
  const stationCall = connection.signing.certificate.callsign
  if (
    request.service !== service ||
    request.stationCall !== stationCall ||
    request.destination.stationCall !== stationCall ||
    request.destination.id !== stationCall.toLowerCase() ||
    isTestOperation(stationCall)
  ) {
    throw new Error('The LoTW destination must match the certificate’s station callsign.')
  }
  return stationCall
}

/** Upload-only transfer: core owns selection, ADIF, receipt writes and progress. */
export function createLotwTransferHook(ports: LotwTransferPorts) {
  let active = false
  const elapsedNowMillis = ports.elapsedNowMillis ?? (() => performance.now())
  return {
    label: 'Logbook of the World',
    description: 'Send contacts to LoTW’s processing queue.',
    services: [{ key: service, label: 'Logbook of the World' }],
    async suggestPushes({ scope }: PushSuggestionsRequest, _ctx: HookContext) {
      if (lotwScopeSelection(scope) === null) return []
      if (ports.available && !(await ports.available())) return []
      return [
        {
          key: service,
          service,
          label: 'Push to LoTW',
          select: { notSentTo: service },
          payload: { full: true, includePrivateData: false, omit: ['app_*', 'notes', 'comment'] },
        },
      ]
    },
    async suggestDestinations(
      { service: requestedService, scope, stationCalls }: DestinationsRequest,
      ctx: HookContext,
    ) {
      const selection = lotwScopeSelection(scope)
      if (requestedService !== service || selection === null) return []
      const calls = ports.stationCalls
        ? ports.stationCalls(ctx)
        : [(await ports.connect(ctx)).signing.certificate.callsign]
      return calls
        .filter(
          (call) =>
            stationCalls.includes(call) &&
            !isTestOperation(call) &&
            (selection.stationCall === undefined || selection.stationCall === call),
        )
        .map((call) => ({ id: call.toLowerCase(), label: call, stationCall: call }))
    },
    async push(request, ctx) {
      if (active) throw new Error('A LoTW upload is already running.')
      if (!ctx.online) throw new Error('Connect to the internet before uploading to LoTW.')
      active = true
      try {
        const started = elapsedNowMillis()
        const connection = await ports.connect(ctx, request.destination?.stationCall)
        const stationCall = verifyDestination(request, connection)
        if (request.records.length > chunkSize) throw new Error(invalid)
        // One result per record, in order. A contact LoTW would refuse gets
        // its reason and stays unsent; the others in the chunk still go.
        const results = new Map<string, PushRecordResult>()
        const groups: { station: LotwStation; contacts: LotwContact[] }[] = []
        for (const record of request.records) {
          if (!record.uuid || results.has(record.uuid)) throw new Error(invalid)
          let prepared: PreparedContact
          try {
            prepared = prepareRecord(record, stationCall)
            checkLotwContact(connection.signing.certificate, prepared.station, prepared.contact)
          } catch (error) {
            const reason = error instanceof LotwContactProblem ? error.message : unreadable
            results.set(record.uuid, { uuid: record.uuid, error: reason })
            continue
          }
          results.set(record.uuid, { uuid: record.uuid })
          const { station, contact } = prepared
          const previous = groups[groups.length - 1]
          if (previous && JSON.stringify(previous.station) === JSON.stringify(station)) {
            previous.contacts.push(contact)
          } else {
            groups.push({ station, contacts: [contact] })
          }
        }
        // Sign the whole chunk before the first upload, so a failure here
        // cannot leave it partly sent. Every contact was checked above, so
        // what fails now is the certificate or the signer, not a contact.
        const files: Uint8Array[] = []
        try {
          for (const { station, contacts } of groups) {
            files.push(
              await buildSignedTq8(
                connection.signing,
                station,
                contacts,
                connection.realNowMillis(),
              ),
            )
          }
        } catch {
          throw new Error(
            `Could not sign the contacts with the LoTW certificate for ${stationCall}. Test the LoTW account in its settings.`,
          )
        }
        const remaining = () => pushBudgetMillis - (elapsedNowMillis() - started)
        const transport: LotwUploadTransport = (request) => {
          const left = remaining()
          if (!Number.isFinite(left) || left <= 0 || left > pushBudgetMillis) {
            throw new LotwNotSentError(
              'The LoTW upload ran out of time before it was sent. Push again.',
            )
          }
          return connection.transport({ ...request, timeout: Math.min(request.timeout, left) })
        }
        for (const [index, file] of files.entries()) {
          if (remaining() < minimumUploadMillis) {
            throw new Error(
              index === 0
                ? 'Signing these contacts took too long, so nothing was sent to LoTW. Push again.'
                : 'Time ran out partway through this LoTW upload. Push again to send the rest.',
            )
          }
          const result = await uploadLotwTq8(file, transport)
          if (result.state !== 'queued') {
            // Throwing stops core from sending later chunks. Core deliberately
            // records no receipts for this chunk, including any earlier
            // accepted location batches; an operator retry can replay them.
            throw new Error(
              result.state === 'rejected'
                ? 'LoTW refused the upload. Check the certificate in the LoTW account settings and review the contacts before trying again.'
                : 'LoTW did not acknowledge the upload. Check Your Account → Your Activity in LoTW before retrying.',
            )
          }
        }
        // This is queue acceptance, not QSL confirmation. LoTW issues no
        // per-contact id; core records the time/hash/revision under transfer.
        return [...results.values()]
      } finally {
        active = false
      }
    },
  } satisfies TransferHook
}
