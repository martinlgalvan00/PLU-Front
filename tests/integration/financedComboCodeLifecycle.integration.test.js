import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * financedComboCodeLifecycle.integration.test.js — PLU ARG
 *
 * La cadena entera del código-paquete financiado, contra Supabase de verdad:
 * alta desde Tarifas -> canje -> checkout del combo -> declaración del pago ->
 * vencimiento del plazo -> baja automática de lo habilitado.
 *
 * Existe por dos reportes de operaciones que resultaron ser el mismo hilo:
 *
 *   1. "Lo doy de alta con tipo Inscripción + Afiliación y no me reconoce el
 *      código". El alta había dejado de guardar `membership_plan_id`
 *      (20260922100000 pisó el cuerpo de 20260918100000), así que el paquete no
 *      se podía resolver en ningún checkout. Lo cubre el primer bloque.
 *   2. "Si el financiamiento tiene 7 o 14 días, pasado el plazo tenemos que
 *      poder deshabilitar". La maquinaria estaba construida
 *      (`expire_financed_payment_orders`) pero nunca había corrido sobre una
 *      orden real, porque ningún código de combo llegaba a canjearse. Lo cubre
 *      el segundo bloque.
 *
 * Es un solo `it` a propósito: cada paso es precondición del siguiente y
 * partirlo obligaría a repetir el fixture de atleta, evento y código tres veces.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const FINANCING_TERM_DAYS = 14
const DAY_MS = 86_400_000


describe('código-paquete financiado, de punta a punta', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []
  const createdCodeIds = []
  let listenTarget

  beforeAll(() => {
    listenTarget = listen(
      createApp({
        supabaseAdmin: admin,
        notifyPaymentApplied: async () => {},
        // Los canales manuales del código destraban el checkout igual
        // (`discountCodeManualEligibility`), pero la precondición se declara en
        // vez de heredarse de la fila compartida — que además cambia mientras
        // platformFeatureToggles.integration.test.js corre en paralelo.
        platformSettingsRepository: manualChannelsOpen(),
        env: {
          ...process.env,
          APP_PRODUCTION: 'false',
          PAYMENTS_MOCK: 'true',
          AUTH_SECRET: process.env.AUTH_SECRET,
        },
      }),
    )
  })

  afterAll(async () => {
    const run = async (operation, label) => {
      const result = await operation
      if (result.error) throw new Error(`Cleanup ${label}: ${result.error.message}`)
      return result.data ?? []
    }

    let orderIds = []
    if (createdAthleteIds.length) {
      const orders = await run(
        admin.from('athlete_payment_orders').select('id').in('athlete_id', createdAthleteIds),
        'ordenes',
      )
      orderIds = orders.map((row) => row.id)
      if (orderIds.length) {
        await run(
          admin.from('embedded_payment_attempts').delete().in('order_id', orderIds),
          'intentos de pago',
        )
      }
      for (const athleteId of createdAthleteIds) {
        await run(
          admin.rpc('delete_athlete', {
            p_athlete_id: athleteId,
            p_actor: 'integration-test-cleanup',
          }),
          `atleta ${athleteId}`,
        )
      }
    }
    if (createdCodeIds.length) {
      await run(
        admin.from('discount_code_unlocks').delete().in('discount_code_id', createdCodeIds),
        'unlocks',
      )
      await run(
        admin.from('discount_code_redemptions').delete().in('discount_code_id', createdCodeIds),
        'canjes',
      )
      await run(
        admin.from('promotion_campaign_events').delete().in('discount_code_id', createdCodeIds),
        'eventos de campaña',
      )
      await run(admin.from('discount_codes').delete().in('id', createdCodeIds), 'codigos')
    }
    if (createdEventIds.length) {
      await run(admin.from('events').delete().in('id', createdEventIds), 'eventos')
    }
    const entityIds = [...createdAthleteIds, ...createdEventIds, ...createdCodeIds, ...orderIds]
    if (entityIds.length) {
      await run(
        admin.from('domain_audit_logs').delete().in('entity_id', entityIds),
        'auditoria por entidad',
      )
    }
    await listenTarget?.close()
  })

  it('se canjea, financia y —vencido el plazo— da de baja afiliación e inscripción', async () => {
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
      throw new Error(`Falta un plan one_time activo: ${planResult.error?.message ?? ''}`)
    }
    const plan = planResult.data

    const slug = `financed-combo-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Financed combo integration test',
        description: 'Fixture del ciclo de financiamiento',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 21 * DAY_MS).toISOString(),
        ends_at: new Date(now + 22 * DAY_MS).toISOString(),
        registration_opens_at: new Date(now - DAY_MS).toISOString(),
        registration_closes_at: new Date(now + 20 * DAY_MS).toISOString(),
        capacity: 4,
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

    // --- 1. Alta del código-paquete desde Tarifas -----------------------------
    // Sin `membershipPlanId`: hay una sola afiliación de pago único vigente y la
    // RPC tiene que resolverla sola, que es exactamente lo que dejó de hacer.
    const separatePrice = plan.price + competition.price
    const comboPrice = separatePrice - 20000
    const code = `COMBO-${randomBytes(6).toString('hex').toUpperCase()}`
    const upsert = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        description: 'Integración: combo financiado',
        kind: 'fixed_price',
        appliesTo: 'combo',
        audience: 'code',
        fixedPrice: comboPrice,
        fixedPriceManual: comboPrice,
        eventId: competition.id,
        manualChannels: ['bank_transfer'],
        // El caso real de operaciones: sólo se cobra a mano y habilita al avisar.
        mercadoPagoEnabled: false,
        financed: true,
        financingTermDays: FINANCING_TERM_DAYS,
        active: true,
      },
      p_actor: 'integration-test',
    })
    if (upsert.error) throw new Error(`Alta del código: ${upsert.error.message}`)
    createdCodeIds.push(upsert.data.id)

    expect(upsert.data.applies_to).toBe('combo')
    // El corazón del bug: sin esto el código no se puede canjear por ningún camino.
    expect(upsert.data.membership_plan_id).toBe(plan.id)
    expect(upsert.data.financing_term_days).toBe(FINANCING_TERM_DAYS)
    expect(upsert.data.financed).toBe(true)

    // --- 2. El panel lo lee con su afiliación --------------------------------
    const configuration = await admin.rpc('staff_get_pricing_configuration')
    if (configuration.error) throw new Error(configuration.error.message)
    const savedCode = configuration.data.discountCodes.find((row) => row.code === code)
    expect(savedCode, 'el código no volvió en la configuración de Tarifas').toBeTruthy()
    expect(savedCode.membershipPlanId).toBe(plan.id)
    expect(savedCode.financingTermDays).toBe(FINANCING_TERM_DAYS)

    // --- 3. Un atleta con el código -----------------------------------------
    // Alta directa y no POST /api/athletes/register: el alta pública normaliza
    // el gimnasio contra Prisma, que en local no tiene ni DATABASE_URL ni las
    // tablas del esquema legado. Este test es sobre el código y el plazo, no
    // sobre el onboarding.
    const athleteId = await createTestAthlete(admin, {
      full_name: `Financed Combo Athlete ${randomUUID().slice(0, 8)}`,
      email: `financed-combo-${randomUUID()}@pluarg.test`,
      document_id: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
      division: 'Open',
      category: 'Raw',
      estimated_weight: 90,
    })
    createdAthleteIds.push(athleteId)
    const cookie = await athleteSessionCookie(admin, athleteId)

    // --- 4. El preview dice el alcance y el plazo ----------------------------
    const preview = await admin.rpc('athlete_preview_discount_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
      p_code: code,
      p_applies_to: 'combo',
      p_base_amount: separatePrice,
      p_payment_method: 'manual_link',
    })
    if (preview.error) throw new Error(preview.error.message)
    expect(preview.data.valid).toBe(true)
    // `appliesTo` es lo único que distingue el paquete de una afiliación suelta:
    // sin él, `unlocksComboBundle` (Express) no reconoce el código.
    expect(preview.data.appliesTo).toBe('combo')
    expect(preview.data.financed).toBe(true)
    expect(preview.data.financingTermDays).toBe(FINANCING_TERM_DAYS)

    // --- 5. El canje universal lo acepta y manda al torneo -------------------
    const redeem = await admin.rpc('athlete_redeem_promotion_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
      p_code: code,
      p_context: { surface: 'registration' },
    })
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status, JSON.stringify(redeem.data)).toBe('accepted')
    // Desde 20260926100000 el paquete abre su propia ficha en Mi cuenta en vez
    // de aplicarse dentro del checkout del torneo: sus condiciones no entran
    // como un cupón más entre el formulario competitivo y el medio de pago.
    expect(redeem.data.action).toBe('open_bundle')
    expect(redeem.data.destination.view).toBe('profile')
    expect(redeem.data.destination.tab).toBe('account-offer')
    // El torneo viaja igual: la ficha cotiza y cobra contra esa inscripción.
    expect(redeem.data.destination.eventSlug).toBe(slug)
    expect(redeem.data.benefit.financed).toBe(true)
    expect(redeem.data.benefit.financingTermDays).toBe(FINANCING_TERM_DAYS)

    // --- 6. El checkout del combo cobra el precio del paquete ----------------
    const created = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        eventSlug: slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
        discountCode: code,
      }),
    })
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)
    const orderId = createdBody.order.id
    expect(Number(createdBody.order.amount)).toBe(comboPrice)
    // La foto del financiamiento la toma `settle_order_financing` dentro de la
    // transacción, después de fijar el canal.
    expect(createdBody.order.financing_allowed ?? createdBody.order.financingAllowed).toBe(true)

    const afterCreate = await admin
      .from('athlete_payment_orders')
      .select('financing_allowed, financing_term_days, financed_payment_due_at, discount_code_id')
      .eq('id', orderId)
      .single()
    if (afterCreate.error) throw new Error(afterCreate.error.message)
    expect(afterCreate.data.financing_term_days).toBe(FINANCING_TERM_DAYS)
    expect(afterCreate.data.discount_code_id).toBe(upsert.data.id)
    // El reloj todavía no arrancó: el atleta no avisó que va a pagar.
    expect(afterCreate.data.financed_payment_due_at).toBeNull()

    // --- 7. Declara el pago: queda habilitado y arranca el plazo -------------
    const declared = await fetch(
      `${listenTarget.url}/api/athletes/me/payment-orders/${orderId}/manual-confirmation`,
      { method: 'POST', headers: { ...mutationHeaders, Cookie: cookie } },
    )
    const declaredBody = await declared.json()
    expect(declared.status, JSON.stringify(declaredBody)).toBe(200)
    expect(declaredBody.order.status).toBe('validacion_manual')
    expect(declaredBody.entitlementsGranted).toBe(true)
    expect(declaredBody.membership.status).toBe('activa')
    expect(declaredBody.registration.status).toBe('confirmada')

    const dueAt = Date.parse(declaredBody.order.financed_payment_due_at)
    expect(Number.isNaN(dueAt)).toBe(false)
    // 14 días desde la declaración, con un minuto de tolerancia por el viaje.
    expect(Math.abs(dueAt - (Date.now() + FINANCING_TERM_DAYS * DAY_MS))).toBeLessThan(60_000)

    const athleteAfterGrant = await admin
      .from('athletes')
      .select('status')
      .eq('id', athleteId)
      .single()
    expect(athleteAfterGrant.data.status).toBe('afiliado_activo')

    // --- 8. Vence el plazo: el reloj da de baja lo que había otorgado --------
    // Se adelanta el vencimiento en vez de esperar 14 días; es la misma columna
    // que mira `expire_financed_payment_orders`.
    const backdate = await admin
      .from('athlete_payment_orders')
      .update({ financed_payment_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', orderId)
    if (backdate.error) throw new Error(backdate.error.message)

    const sweep = await admin.rpc('expire_financed_payment_orders', {
      p_now: new Date().toISOString(),
    })
    if (sweep.error) throw new Error(sweep.error.message)
    expect(sweep.data.failedOrders).toBe(0)
    expect(sweep.data.expiredOrders).toBeGreaterThanOrEqual(1)

    const expired = await admin
      .from('athlete_payment_orders')
      .select('status, cancellation_code, financed_entitlements_revoked_at, rejected_by')
      .eq('id', orderId)
      .single()
    if (expired.error) throw new Error(expired.error.message)
    expect(expired.data.status).toBe('rechazado')
    expect(expired.data.cancellation_code).toBe('financing_term_expired')
    expect(expired.data.financed_entitlements_revoked_at).not.toBeNull()
    expect(expired.data.rejected_by).toBe('system:expire_financed_payment_orders')

    const membership = await admin
      .from('memberships')
      .select('status')
      .eq('payment_order_id', orderId)
      .single()
    expect(membership.data.status).toBe('cancelada')

    const registration = await admin
      .from('event_registrations')
      .select('status')
      .eq('payment_order_id', orderId)
      .single()
    expect(registration.data.status).toBe('cancelada')

    const athleteAfterExpiry = await admin
      .from('athletes')
      .select('status')
      .eq('id', athleteId)
      .single()
    expect(athleteAfterExpiry.data.status).toBe('registrado')

    // El canje se libera: el código no se quemó, porque nunca hubo una venta.
    const redemptions = await admin
      .from('discount_code_redemptions')
      .select('id')
      .eq('discount_code_id', upsert.data.id)
      .eq('athlete_id', athleteId)
    expect(redemptions.data ?? []).toHaveLength(0)

    // La bitácora distingue el reloj de una persona: es el dato con el que
    // Finanzas le explica al atleta por qué perdió la inscripción.
    const audit = await admin
      .from('domain_audit_logs')
      .select('action, metadata')
      .eq('entity_id', orderId)
      .eq('action', 'payment.financing_term_expired')
    expect(audit.data ?? []).toHaveLength(1)
    expect(audit.data[0].metadata.financingTermDays).toBe(FINANCING_TERM_DAYS)
  })
})
