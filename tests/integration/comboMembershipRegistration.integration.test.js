import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('combo afiliacion + inscripcion contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []

  afterAll(async () => {
    const cleanup = async (operation, label) => {
      const result = await operation
      if (result.error) throw new Error(`Cleanup ${label}: ${result.error.message}`)
      return result.data ?? []
    }

    let orderIds = []
    let attemptIds = []
    if (createdAthleteIds.length) {
      const orders = await cleanup(
        admin.from('athlete_payment_orders').select('id').in('athlete_id', createdAthleteIds),
        'ordenes',
      )
      orderIds = orders.map((row) => row.id)
      if (orderIds.length) {
        const attempts = await cleanup(
          admin.from('embedded_payment_attempts').select('id').in('order_id', orderIds),
          'intentos de pago',
        )
        attemptIds = attempts.map((row) => row.id)
        await cleanup(
          admin.from('embedded_payment_attempts').delete().in('order_id', orderIds),
          'intentos de pago',
        )
      }
      for (const athleteId of createdAthleteIds) {
        await cleanup(
          admin.rpc('delete_athlete', {
            p_athlete_id: athleteId,
            p_actor: 'integration-test-cleanup',
          }),
          `atleta ${athleteId}`,
        )
      }
    }
    if (createdEventIds.length) {
      await cleanup(
        admin.from('event_combo_offers').delete().in('event_id', createdEventIds),
        'ofertas combo',
      )
      await cleanup(admin.from('events').delete().in('id', createdEventIds), 'eventos')
    }

    const entityIds = [...createdAthleteIds, ...createdEventIds, ...orderIds, ...attemptIds]
    await cleanup(
      admin
        .from('transactional_email_logs')
        .delete()
        .like('recipient_email', 'combo-%@pluarg.test'),
      'emails de fixture',
    )
    if (createdAthleteIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('actor_id', createdAthleteIds),
        'auditoria por actor',
      )
      await cleanup(
        admin.from('operational_event_logs').delete().in('actor_id', createdAthleteIds),
        'eventos operativos por actor',
      )
    }
    if (entityIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('entity_id', entityIds),
        'auditoria por entidad',
      )
      await cleanup(
        admin.from('operational_event_logs').delete().in('entity_id', entityIds),
        'eventos operativos por entidad',
      )
    }
  })

  it('es idempotente y una aprobacion activa ambos derechos', async () => {
    const nowIso = new Date().toISOString()
    const planResult = await admin
      .from('membership_plans')
      .select('*')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .lte('effective_from', nowIso)
      .or(`retired_at.is.null,retired_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (planResult.error || !planResult.data) {
      throw new Error(
        `Falta un plan one_time activo para el test: ${planResult.error?.message ?? ''}`,
      )
    }
    const plan = planResult.data
    const slug = `combo-integration-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Combo integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 2,
        status: 'inscripcion_abierta',
        published: true,
        requires_membership: true,
        price: 45000,
        currency: plan.currency,
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    const competition = eventResult.data
    createdEventIds.push(competition.id)

    const comboPrice = Math.max(1, plan.price + competition.price - 1000)
    const offerResult = await admin.from('event_combo_offers').insert({
      organization_id: plan.organization_id,
      event_id: competition.id,
      membership_plan_id: plan.id,
      price: comboPrice,
      currency: plan.currency,
      active: true,
    })
    if (offerResult.error) throw new Error(offerResult.error.message)

    const suffix = randomUUID()
    const athleteResponse = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `Combo Athlete ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `combo-${suffix}@pluarg.test`,
        birthDate: '1995-01-01',
        phone: '1122334455',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'CABA',
        gym: 'Test Gym',
        sex: 'Masculino',
        division: 'Open',
        category: 'Raw',
        estimatedWeight: 90,
        password: 'integration-test-password-athlete',
      }),
    })
    const athleteBody = await athleteResponse.json()
    expect(athleteResponse.status, JSON.stringify(athleteBody)).toBe(201)
    createdAthleteIds.push(athleteBody.athlete.id)
    await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', athleteBody.athlete.id)

    const idempotencyKey = randomUUID()
    const payload = {
      eventSlug: slug,
      division: 'Open',
      category: 'Raw',
      bodyweightKg: 90,
      paymentMethod: 'manual_link',
      idempotencyKey,
    }
    const cookie = sessionCookie(athleteResponse)
    const createCombo = () =>
      fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: { ...mutationHeaders, Cookie: cookie },
        body: JSON.stringify(payload),
      })

    const first = await createCombo()
    const firstBody = await first.json()
    expect(first.status, JSON.stringify(firstBody)).toBe(201)
    const second = await createCombo()
    const secondBody = await second.json()
    expect(second.status, JSON.stringify(secondBody)).toBe(201)
    expect(secondBody.order.id).toBe(firstBody.order.id)
    expect(secondBody.membership.id).toBe(firstBody.membership.id)
    expect(secondBody.registration.id).toBe(firstBody.registration.id)

    const proof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: firstBody.order.id,
      p_athlete_id: athleteBody.athlete.id,
      p_proof_path: `${firstBody.order.id}/integration-proof.pdf`,
      p_notes: null,
    })
    if (proof.error) throw new Error(proof.error.message)
    expect(proof.data.order.status).toBe('validacion_manual')

    const approved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: firstBody.order.id,
      p_actor: 'integration-test',
    })
    if (approved.error) throw new Error(approved.error.message)
    expect(approved.data.order.status).toBe('aprobado')
    expect(approved.data.membership.status).toBe('activa')
    expect(approved.data.registration.status).toBe('confirmada')
  })

  it('procesa el combo con Mercado Pago mock, recupera una falla y evita doble cobro', async () => {
    const nowIso = new Date().toISOString()
    const planResult = await admin
      .from('membership_plans')
      .select('*')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .lte('effective_from', nowIso)
      .or(`retired_at.is.null,retired_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (planResult.error || !planResult.data) {
      throw new Error(
        `Falta un plan one_time activo para el test: ${planResult.error?.message ?? ''}`,
      )
    }
    const plan = planResult.data
    const slug = `combo-payment-integration-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Combo payment integration test',
        description: 'Fixture de pago transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 2,
        status: 'inscripcion_abierta',
        published: true,
        requires_membership: true,
        price: 45000,
        currency: plan.currency,
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    const competition = eventResult.data
    createdEventIds.push(competition.id)

    const comboPrice = Math.max(1, plan.price + competition.price - 1000)
    const offerResult = await admin.from('event_combo_offers').insert({
      organization_id: plan.organization_id,
      event_id: competition.id,
      membership_plan_id: plan.id,
      price: comboPrice,
      currency: plan.currency,
      active: true,
    })
    if (offerResult.error) throw new Error(offerResult.error.message)

    const suffix = randomUUID()
    const email = `combo-payment-${suffix}@pluarg.test`
    const athleteResponse = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `Combo Payment Athlete ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email,
        birthDate: '1995-01-01',
        phone: '1122334455',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'CABA',
        gym: 'Test Gym',
        sex: 'Masculino',
        division: 'Open',
        category: 'Raw',
        estimatedWeight: 90,
        password: 'integration-test-password-athlete',
      }),
    })
    const athleteBody = await athleteResponse.json()
    expect(athleteResponse.status, JSON.stringify(athleteBody)).toBe(201)
    createdAthleteIds.push(athleteBody.athlete.id)
    await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', athleteBody.athlete.id)

    const credentialBeforePayment = await admin
      .from('athletes')
      .select('credential_token')
      .eq('id', athleteBody.athlete.id)
      .single()
    if (credentialBeforePayment.error) throw new Error(credentialBeforePayment.error.message)
    expect(credentialBeforePayment.data.credential_token).toBeTruthy()

    const cookie = sessionCookie(athleteResponse)
    const comboResponse = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        eventSlug: slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'mercado_pago',
        idempotencyKey: randomUUID(),
      }),
    })
    const comboBody = await comboResponse.json()
    expect(comboResponse.status, JSON.stringify(comboBody)).toBe(201)

    const preferenceResponse = await fetch(`${listenTarget.url}/api/payments/preferences`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({ paymentOrderId: comboBody.order.id }),
    })
    const preferenceBody = await preferenceResponse.json()
    expect(preferenceResponse.status, JSON.stringify(preferenceBody)).toBe(201)
    expect(preferenceBody.preference.id).toMatch(/^mock_pref_/)

    const processPayment = (token, paymentMethodId) =>
      fetch(`${listenTarget.url}/api/payments/embedded/process`, {
        method: 'POST',
        headers: { ...mutationHeaders, Cookie: cookie },
        body: JSON.stringify({
          paymentOrderId: comboBody.order.id,
          formData: {
            token,
            payment_method_id: paymentMethodId,
            payment_type_id: 'credit_card',
            installments: 1,
            payer: { email },
          },
        }),
      })

    const failedPayment = await processPayment('mock_card_token_provider_failure', 'mock_error')
    expect(failedPayment.status).toBe(502)
    // El mensaje al cliente sigue siendo opaco, pero ahora viaja el id de
    // correlacion: es lo que permite encontrar el stack de ESTE cobro fallido
    // en los logs y en la bitacora de auditoria.
    expect(await failedPayment.json()).toEqual({
      error: 'Error interno',
      requestId: failedPayment.headers.get('x-request-id'),
    })

    const afterFailure = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', comboBody.order.id)
      .single()
    expect(afterFailure.data?.status).toBe('pendiente')

    const approvedPayment = await processPayment(
      'mock_card_token_provider_success',
      'mock_approved',
    )
    const approvedBody = await approvedPayment.json()
    expect(approvedPayment.status, JSON.stringify(approvedBody)).toBe(201)
    expect(approvedBody.payment.status).toBe('approved')
    expect(approvedBody.order.status).toBe('aprobado')

    const [membershipResult, registrationResult, credentialAfterPayment] = await Promise.all([
      admin.from('memberships').select('status').eq('id', comboBody.membership.id).single(),
      admin
        .from('event_registrations')
        .select('status')
        .eq('id', comboBody.registration.id)
        .single(),
      admin.from('athletes').select('credential_token').eq('id', athleteBody.athlete.id).single(),
    ])
    expect(membershipResult.data?.status).toBe('activa')
    expect(registrationResult.data?.status).toBe('confirmada')
    expect(credentialAfterPayment.data?.credential_token).toBe(
      credentialBeforePayment.data.credential_token,
    )

    // El mismo token emitido al crear la persona se actualiza por proyección:
    // con contexto de puerta devuelve ambos derechos; sin evento, lista las
    // inscripciones vigentes. No se genera ni se reemplaza un segundo QR.
    const [credentialAtGate, universalCredential] = await Promise.all([
      admin.rpc('get_membership_by_code_or_token', {
        p_code: credentialBeforePayment.data.credential_token,
        p_event_slug: slug,
      }),
      admin.rpc('get_membership_by_code_or_token', {
        p_code: credentialBeforePayment.data.credential_token,
        p_event_slug: null,
      }),
    ])
    if (credentialAtGate.error) throw new Error(credentialAtGate.error.message)
    if (universalCredential.error) throw new Error(universalCredential.error.message)

    expect(credentialAtGate.data.athlete.id).toBe(athleteBody.athlete.id)
    expect(credentialAtGate.data.membership).toMatchObject({
      id: comboBody.membership.id,
      status: 'activa',
    })
    expect(credentialAtGate.data.registration).toMatchObject({
      id: comboBody.registration.id,
      status: 'confirmada',
      event_slug: slug,
    })
    expect(universalCredential.data.membership.status).toBe('activa')
    expect(universalCredential.data.registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: comboBody.registration.id,
          status: 'confirmada',
          event_slug: slug,
        }),
      ]),
    )

    const checkIn = await admin.rpc('staff_check_in_registration', {
      p_registration_id: credentialAtGate.data.registration.id,
      p_gate: 'combo-integration-gate',
      p_actor: 'integration-test',
    })
    if (checkIn.error) throw new Error(checkIn.error.message)
    expect(checkIn.data.registration.id).toBe(comboBody.registration.id)
    expect(checkIn.data.checkIn.registration_id).toBe(comboBody.registration.id)

    const duplicatePayment = await processPayment(
      'mock_card_token_provider_success',
      'mock_approved',
    )
    const duplicateBody = await duplicatePayment.json()
    expect(duplicatePayment.status, JSON.stringify(duplicateBody)).toBe(200)
    expect(duplicateBody.duplicate).toBe(true)
    expect(duplicateBody.payment).toBeNull()
    expect(duplicateBody.order.status).toBe('aprobado')
  })

  const listenTarget = listen(
    createApp({
      supabaseAdmin: admin,
      notifyPaymentApplied: async () => {},
      // El combo manual exige los dos canales abiertos; en la base compartida
      // están cerrados porque el lanzamiento va sólo con Mercado Pago.
      platformSettingsRepository: manualChannelsOpen(),
      env: {
        ...process.env,
        APP_PRODUCTION: 'false',
        PAYMENTS_MOCK: 'true',
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    }),
  )

  afterAll(async () => {
    await listenTarget.close()
  })
})
