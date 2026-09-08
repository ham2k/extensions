// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// How the party is found, set up, typed into and named — the surface an
// operator touches, as opposed to what the scorer makes of it.

import { test } from "node:test"
import assert from "node:assert/strict"

import type {
  FormElement,
  FormInputDescriptor,
  JSONValue,
  OptionsInputDescriptor,
} from "@ham2k/extension-sdk"

import { qsoPartyActivity } from "./activity.ts"
import type { QsoPartyParams } from "./params.ts"
import { qsoPartyRefHandler } from "./refHandler.ts"
import { CA, MN, NEQP, NV, NY, WI } from "./testFixtures.ts"

const ctx = { online: false } as never

function operation(ref: Record<string, JSONValue> = {}, params: QsoPartyParams = NY): Record<string, JSONValue> {
  return { uuid: 'op', stationCall: 'N0DEV', refs: [{ type: params.refType, ...ref }] }
}

async function setupForm(params: QsoPartyParams, ref: Record<string, JSONValue> = {}) {
  const controls = await qsoPartyActivity(params).operationControls!(
    { operation: operation(ref, params) },
    ctx,
  )
  return (controls[0].input as FormInputDescriptor).form
}

/// The questions a setup form asks, in order. The help text and the information
/// panel are elements too, and carry no key.
function fieldKeys(form: { elements: FormElement[] }): string[] {
  return form.elements.flatMap((element) => ('key' in element && element.key ? [element.key] : []))
}

async function exchangeInput(params: QsoPartyParams, qso?: Record<string, JSONValue>) {
  const controls = await qsoPartyActivity(params).loggingControls!(
    { operation: operation({}, params), qso },
    ctx,
  )
  const control = controls.find((c) => c.key === `${params.refType}/location`)!
  return { controls, input: control.input as OptionsInputDescriptor }
}

test('the party is found by its own name, its short name or its state', async () => {
  const suggest = qsoPartyActivity(NY).suggest!
  for (const term of ['new york', 'NYQP', 'ny', 'qso party']) {
    const found = await suggest({ operation: {}, searchTerm: term }, ctx)
    assert.equal(found.length, 1, `"${term}" finds nothing`)
  }
  // Somebody else's party is somebody else's answer.
  assert.deepEqual(await suggest({ operation: {}, searchTerm: 'texas' }, ctx), [])
  // Unless this extension alone was asked, in which case the answer is what it
  // has: a scoped search is the operator looking AT this party, not for it.
  assert.equal((await suggest({ operation: {}, searchTerm: 'texas', scoped: true }, ctx)).length, 1)
})

test('a party spanning several states is found by any one of them', async () => {
  // A multi-state party has NO `state` — none of its own outranks the others —
  // and its name says nothing about where it is. Without the states it spans,
  // an operator in Massachusetts typing where they are finds nothing at all.
  const suggest = qsoPartyActivity(NEQP).suggest!
  for (const term of ['MA', 'ma', ' CT ', 'RI']) {
    assert.equal((await suggest({ operation: {}, searchTerm: term }, ctx)).length, 1, `"${term}" finds nothing`)
  }
  // A state this party does not span is somebody else's answer. The term is
  // matched WHOLE, as a single state is: a two-character code tested as a
  // substring would answer for a party it has nothing to do with.
  assert.deepEqual(await suggest({ operation: {}, searchTerm: 'AK' }, ctx), [])

  // And a single-state party still answers for its own state and no other.
  const ny = qsoPartyActivity(NY).suggest!
  assert.equal((await ny({ operation: {}, searchTerm: 'ny' }, ctx)).length, 1)
  assert.deepEqual(await ny({ operation: {}, searchTerm: 'MA' }, ctx), [])
})

test('a suggestion carries everything the activity row shows', async () => {
  // The suggestion path persists what this returns VERBATIM and never calls
  // `decorateRef`, so a ref added by tapping a suggestion reaches the activities
  // row with whatever is written here and nothing else.
  const [suggestion] = await qsoPartyActivity(NY).suggest!({ operation: {} }, ctx)
  assert.equal(suggestion.type, NY.refType)
  assert.equal(suggestion.label, 'New York QSO Party 2026')
  assert.equal(suggestion.shortLabel, 'NYQP')
  assert.equal(suggestion.name, 'New York QSO Party • 2026-10-17')
  assert.equal(suggestion.program, 'Contest')

  // And `decorateRef` composes the same two strings, or the same operation reads
  // differently depending on how its party was added.
  const decorated = await qsoPartyRefHandler(NY).decorateRef!({ ref: { type: NY.refType } }, ctx)
  assert.equal(decorated.label, suggestion.label)
  assert.equal(decorated.name, suggestion.name)
  // The county rides along in the short label, which is what the row has room
  // for.
  const located = await qsoPartyRefHandler(NY).decorateRef!(
    { ref: { type: NY.refType, location: 'alb' } },
    ctx,
  )
  assert.equal(located.shortLabel, 'NYQP: ALB')
})

test('the setup form asks where we are, and never which party', async () => {
  // One extension is ONE party: an engine that kept a party picker would ask the
  // operator to choose the party they chose by enabling this extension, and give
  // them a way to pick a different one.
  const form = await setupForm(NY, { location: 'ALB' })
  const keys = fieldKeys(form)
  assert.equal(keys.includes('ref'), false)
  assert.deepEqual(keys, ['location', 'operator', 'power', 'station', 'mode', 'overlay', 'email'])
  // The location field is prefilled with what the ref already says.
  const location = form.elements.find((element) => 'key' in element && element.key === 'location')
  assert.equal((location as { value?: string } | undefined)?.value, 'ALB')
})

test('an axis the sponsor does not classify by is a question nobody is asked', async () => {
  // Every class is a claim that goes into the submitted log's `CATEGORY-` lines,
  // and for some parties multiplies the score. A party that publishes none is
  // asked nothing.
  const form = await setupForm(NV)
  assert.deepEqual(fieldKeys(form), ['location', 'email'])
  // And a party that publishes only power classes is asked only that.
  const wi = await setupForm(WI)
  assert.deepEqual(fieldKeys(wi), ['location', 'power', 'email'])
})

test('the name is asked for only by the party that exchanges one', async () => {
  const mn = await setupForm(MN)
  assert.ok(fieldKeys(mn).includes('ourName'))
  const ny = await setupForm(NY)
  assert.equal(fieldKeys(ny).includes('ourName'), false)
})

test('the county-line help is shown by the parties that have county lines', async () => {
  const ny = await setupForm(NY)
  assert.ok(ny.elements.some((element) => element.type === 'markdown' && /county line/i.test(element.text)))
  const wi = await setupForm(WI)
  assert.equal(wi.elements.some((element) => element.type === 'markdown' && /county line/i.test(element.text)), false)
})

test('the information panel says when the party runs and how far to trust that', async () => {
  const form = await setupForm({ ...NY, status: 'Verified for 2026', lastUpdated: '2026-09-06' })
  const markdown = form.elements.filter((element) => element.type === 'markdown').map((element) => element.text).join('\n')
  assert.match(markdown, /2026-10-17 14:00Z — 2026-10-18 01:59Z/)
  assert.match(markdown, /Verified for 2026/)
  assert.match(markdown, /2026-09-06/)
  // A party that runs two sessions shows both: one range spanning the gap
  // between them claims hours the sponsor does not score.
  const twoSessions = await setupForm({
    ...NY,
    periods: [
      { startMillis: Date.UTC(2026, 9, 17, 14), endMillis: Date.UTC(2026, 9, 18, 2) },
      { startMillis: Date.UTC(2026, 9, 18, 14), endMillis: Date.UTC(2026, 9, 18, 23) },
    ],
  })
  const periods = twoSessions.elements
    .filter((element) => element.type === 'markdown')
    .map((element) => element.text).join('\n')
    .match(/\*\*Period:/g)
  assert.equal(periods?.length, 2)
})

test('the exchange field asks for a serial only where the sponsor does', async () => {
  const { controls } = await exchangeInput(CA)
  assert.deepEqual(controls.map((control) => control.key), [
    `${CA.refType}/ourSerial`,
    `${CA.refType}/theirSerial`,
    `${CA.refType}/location`,
  ])
  const plain = await exchangeInput(NY)
  assert.deepEqual(plain.controls.map((control) => control.key), [`${NY.refType}/location`])
})

test('the exchange field is as long as the exchange can be', async () => {
  // A county line is two codes and a separator; a party without them has one
  // code, and a field long enough for two invites an exchange it cannot score.
  assert.equal((await exchangeInput(NY)).input.maxLength, 13)
  assert.equal((await exchangeInput(WI)).input.maxLength, 6)
})

test('a station with no list to choose from types whatever they heard', async () => {
  // For a DX station the option set is empty — nobody asks them for a county —
  // so the field has to accept a value it cannot offer.
  const dx = await exchangeInput(NY, { their: { call: 'DL1ABC', entityPrefix: 'DL' } })
  assert.deepEqual(dx.input.options, [])
  assert.equal(dx.input.allowFreeform, true)
  // A US station has a list, and the field is held to it.
  const us = await exchangeInput(NY, { their: { call: 'K1ABC', entityPrefix: 'K' } })
  assert.ok(us.input.options!.length > 0)
  assert.equal(us.input.allowFreeform, false)
})

test("the lookup's state ranks the list rather than filling the field", async () => {
  // A guess is right often enough to be worth floating that state's counties to
  // the top, and wrong often enough that writing one in would be worse than
  // useless.
  const { input } = await exchangeInput(NY, { their: { call: 'K1ABC', entityPrefix: 'K', guess: { state: 'NY' } } })
  assert.ok(input.preferredCodes!.includes('ALB'))
  assert.ok(input.preferredCodes!.includes('NY'))
})

test('the exchange is mirrored into the field the rest of the app reads', async () => {
  const save = qsoPartyActivity(CA).processQsoBeforeSave!
  const patch = await save({
    qso: { refs: [{ type: CA.refType, location: 'butt', theirSerial: '34', ourSerial: '12' }] },
    operation: operation({ location: 'ALAM' }, CA),
  }, ctx)
  assert.deepEqual(patch!.their, { exchange: '34 BUTT' })
  assert.deepEqual(patch!.our, { exchange: '12 ALAM' })
})

test('a contact with nothing of ours on it is left alone', async () => {
  // `their.exchange` is one field shared by every activity on the operation, and
  // the patch is merged one level deep — so answering with an empty string
  // unconditionally writes over whatever a co-active activity just put there,
  // and a DX contact, whose exchange is empty for every party, does it every
  // time.
  const save = qsoPartyActivity(NY).processQsoBeforeSave!
  const untouched = await save({ qso: {}, operation: operation({}) }, ctx)
  assert.equal(untouched, null)
  // A deliberate blank still projects, so clearing an exchange on an edit clears
  // the QSO row's column with it.
  const cleared = await save({
    qso: { refs: [{ type: NY.refType, location: '' }] },
    operation: operation({}),
  }, ctx)
  assert.deepEqual(cleared!.their, { exchange: '' })
})

test('the county we were in is stamped once and never revised', async () => {
  // This hook runs on every EDIT as well as the first save: stamping
  // unconditionally moves an old contact's county to wherever the operator
  // happens to be now.
  const save = qsoPartyActivity(NY).processQsoBeforeSave!
  const fresh = await save({
    qso: { refs: [{ type: NY.refType, location: 'ERI' }] },
    operation: operation({ location: 'ALB' }),
  }, ctx)
  assert.deepEqual(fresh!.refs, [{ type: NY.refType, ourLocation: 'ALB' }])

  const edited = await save({
    qso: { refs: [{ type: NY.refType, location: 'ERI', ourLocation: 'ALB' }] },
    operation: operation({ location: 'REN' }),
  }, ctx)
  assert.equal(edited!.refs, undefined)
  assert.deepEqual(edited!.our, { exchange: 'ALB' })
})

test('the operation is titled for the party, and subtitled with where we are', async () => {
  const handler = qsoPartyRefHandler(NY)
  const title = await handler.suggestOperationTitle!({
    ref: { type: NY.refType, location: 'ALB/REN' },
    operation: operation({ location: 'ALB/REN' }),
  }, ctx)
  assert.equal(title!.for, 'NYQP')
  // The county's NAME, which is what an operator recognizes.
  assert.equal(title!.subtitle, 'Albany / Rensselaer')

  // The rules are what there is to read about a contest.
  assert.deepEqual(await handler.linkForRef!({ ref: { type: NY.refType } }, ctx), {
    url: 'https://nyqp.org/',
    label: 'New York QSO Party',
  })
  assert.equal(await qsoPartyRefHandler(WI).linkForRef!({ ref: { type: WI.refType } }, ctx), null)
})

test('any ref of this type is this party, and carries no second name for it', async () => {
  // The ref TYPE is the party. A `normalized` would be written back into the
  // ref's own `ref` field — a second key holding the same fact, free to
  // disagree with the type after a rename — so validation answers with the
  // verdict alone.
  assert.deepEqual(await qsoPartyRefHandler(NY).validateRef!({ ref: { type: NY.refType } }, ctx), {
    valid: true,
  })

  // And neither creation path writes one: `suggest` persists what it returns
  // verbatim, `decorateRef` decorates what it is handed, and a `ref` appearing
  // on either would be an operation ref the other could not match.
  const [suggestion] = await qsoPartyActivity(NY).suggest!({ operation: {} }, ctx)
  assert.equal(suggestion.ref, undefined)
  const decorated = await qsoPartyRefHandler(NY).decorateRef!({ ref: { type: NY.refType } }, ctx)
  assert.equal(decorated.ref, undefined)
})
