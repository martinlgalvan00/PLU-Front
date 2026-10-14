import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Perfil de cobro al guardar un evento, contra Postgres real.
 *
 * El índice único de nombre (`payment_profiles_org_name_kind_uidx`) es lo que
 * rompía el guardado ("No se pudo crear el perfil de cobro."); un doble en
 * memoria sólo lo imita. Acá corre el endpoint completo (validación, ruta,
 * repositorio, RPC `staff_save_event`) y se relee lo que quedó en las tablas.
 */
const run = randomUUID().slice(0, 8)
const SLUG = `int-cobro-${run}`
const TITLE = `Int Cobro ${run}`
const AUTO_NAME = `Transferencia · ${TITLE}`

function eventPayload(overrides = {}) {
  return {
    slug: SLUG,
    title: TITLE,
    venue: 'QA Gym',
    location: 'CABA',
    startsAt: '2027-03-15T09:00',
    endsAt: '2027-03-15T20:00',
    status: 'proximamente',
    published: false,
    slots: 80,
    featured: false,
    pricing: { membership: 0, registration: 75000, combo: 0, ticketsEnabled: false },
    paymentChannelOverrides: {
      registration: { bank_transfer: 'open', cash_pitbull: 'open' },
    },
    ...overrides,
  }
}

describe('guardado de evento con perfil de cobro (Supabase real)', () => {
  const admin = createSupabaseTestClient()
  let target
  let cookie
  const createdProfileIds = new Set()
  let previousProfileId
  let organizationId

  // Como el editor: el primer guardado crea, los siguientes editan por `id`.
  let eventId = null

  const upsert = async (body) => {
    const response = await fetch(`${target.url}/api/events/upsert`, {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify(eventId ? { ...body, id: eventId } : body),
    })
    if (!eventId && response.ok) eventId = (await storedEvent()).id
    return response
  }

  async function storedEvent() {
    const { data, error } = await admin
      .from('events')
      .select(
        'id, bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder, bank_transfer_profile_id, cash_payment_place, cash_payment_notes',
      )
      .eq('slug', SLUG)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async function ownProfiles() {
    const { data, error } = await admin
      .from('payment_profiles')
      .select('id, name, active, config')
      .eq('kind', 'bank_transfer')
      .ilike('name', `%${TITLE}%`)
    if (error) throw new Error(error.message)
    return data ?? []
  }

  beforeAll(async () => {
    const staff = await buildStaffUser({ email: `cobro-${run}@events.test` })
    target = listen(createApp({ prisma: createPrismaDouble([staff]), supabaseAdmin: admin }))
    ;({ cookie } = await loginStaff(target.url, { email: staff.email }))

    // El perfil que el evento "ya creó" antes, con otro alias: ocupa el nombre
    // automático. Se inserta con la organización de otro perfil real.
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (orgError) throw new Error(orgError.message)
    organizationId = org.id
    const { data: previous, error } = await admin
      .from('payment_profiles')
      .insert({
        organization_id: org.id,
        name: AUTO_NAME,
        kind: 'bank_transfer',
        config: { alias: `previo.${run}`, cbu: '', holder: '' },
        active: true,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    previousProfileId = previous.id
    createdProfileIds.add(previousProfileId)
  })

  afterAll(async () => {
    await target?.close()
    await admin.from('events').delete().eq('slug', SLUG)
    for (const profile of await ownProfiles()) createdProfileIds.add(profile.id)
    for (const id of createdProfileIds) await admin.from('payment_profiles').delete().eq('id', id)
  })

  it('alias suelto con el nombre automático ocupado: guarda el evento y el efectivo', async () => {
    const response = await upsert(
      eventPayload({
        bankTransfer: { alias: `suelto.${run}`, cbu: '', holder: '' },
        cashPayment: { place: 'Virtus fitness - Berazategui', notes: 'Sujeta a la fecha de pago.' },
      }),
    )
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBeLessThan(300)
    const stored = await storedEvent()
    expect(stored.cash_payment_place).toBe('Virtus fitness - Berazategui')
    expect(stored.cash_payment_notes).toBe('Sujeta a la fecha de pago.')
    expect(stored.bank_transfer_alias).toBe(`suelto.${run}`)
    expect(stored.bank_transfer_profile_id).toBeTruthy()
    expect(stored.bank_transfer_profile_id).not.toBe(previousProfileId)

    const profiles = await ownProfiles()
    const created = profiles.find((profile) => profile.id === stored.bank_transfer_profile_id)
    expect(created.config.alias).toBe(`suelto.${run}`)
    expect(created.name).not.toBe(AUTO_NAME)
    expect(profiles.find((profile) => profile.id === previousProfileId)).toMatchObject({
      active: true,
      name: AUTO_NAME,
    })
  })

  it('guardar de nuevo lo mismo no crea otro perfil', async () => {
    const before = (await ownProfiles()).length
    const response = await upsert(
      eventPayload({ bankTransfer: { alias: `SUELTO.${run}`, cbu: '', holder: '' } }),
    )
    expect(response.status, await response.text()).toBeLessThan(300)
    expect((await ownProfiles()).length).toBe(before)
  })

  it('guardados simultáneos con alias distintos terminan todos, con nombres distintos', async () => {
    const aliases = ['a', 'b', 'c', 'd'].map((letter) => `carrera.${letter}.${run}`)
    const responses = await Promise.all(
      aliases.map((alias) =>
        upsert(eventPayload({ bankTransfer: { alias, cbu: '', holder: '' } })),
      ),
    )
    for (const response of responses) {
      expect(response.status, await response.clone().text()).toBeLessThan(300)
    }

    const profiles = await ownProfiles()
    for (const alias of aliases) {
      expect(
        profiles.some((profile) => profile.config.alias === alias),
        alias,
      ).toBe(true)
    }
    const names = profiles
      .filter((profile) => profile.active)
      .map((profile) => profile.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('elegir un perfil existente vincula el evento y copia sus datos', async () => {
    const response = await upsert(eventPayload({ bankTransferProfileId: previousProfileId }))
    expect(response.status, await response.clone().text()).toBeLessThan(300)

    const stored = await storedEvent()
    expect(stored.bank_transfer_profile_id).toBe(previousProfileId)
    expect(stored.bank_transfer_alias).toBe(`previo.${run}`)
  })

  it('POST /api/payment-profiles con un nombre ocupado responde 409 con el campo name', async () => {
    const response = await fetch(`${target.url}/api/payment-profiles`, {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify({
        name: AUTO_NAME.toUpperCase(),
        kind: 'bank_transfer',
        config: { alias: `otro.${run}` },
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('PAYMENT_PROFILE_NAME_TAKEN')
    expect(body.fields.name).toMatch(/ya hay un perfil/i)
    expect(body.error).not.toMatch(/No se pudo crear/)
  })

  it('PATCH que renombra contra otro perfil activo responde 409 y el mismo nombre no choca', async () => {
    const { data: other, error } = await admin
      .from('payment_profiles')
      .insert({
        organization_id: organizationId,
        name: `Otra cuenta ${run}`,
        kind: 'bank_transfer',
        config: { alias: `otra.cuenta.${run}` },
        active: true,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    createdProfileIds.add(other.id)

    const patch = (id, name) =>
      fetch(`${target.url}/api/payment-profiles/${id}`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ name }),
      })

    const clash = await patch(other.id, AUTO_NAME)
    expect(clash.status).toBe(409)
    expect((await clash.json()).code).toBe('PAYMENT_PROFILE_NAME_TAKEN')

    const same = await patch(other.id, `Otra cuenta ${run}`)
    expect(same.status, await same.clone().text()).toBe(200)
  })
})
