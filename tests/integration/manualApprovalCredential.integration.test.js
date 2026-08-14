import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { authHeaders, buildStaffUser, createPrismaDouble, loginStaff } from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Transferencia validada desde el panel → derechos activos → QR al día.
 *
 * Recorre el camino completo por HTTP, no por RPC: el atleta crea la orden
 * manual y sube el comprobante con su cookie, Finanzas la aprueba con la suya
 * (pasando por `requirePermission('admin.payments.approve')`), y después se
 * comprueba que el atleta ve la afiliación activa y la inscripción confirmada,
 * y que su credencial —el token estable de `athletes.credential_token`—
 * resuelve con esa información nueva en la puerta.
 *
 * Cubre el hueco que dejaban los tests existentes: `pitbullCheckout` aprueba
 * llamando la RPC con service_role, así que nunca ejercitó la ruta de staff ni
 * la lectura posterior del atleta.
 */
const EVENT_SLUG = 'pitbull-classic-2026'

describe('validación manual de transferencia y credencial resultante', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []
  let staffCookie = null

  const staffUsers = []
  const target = listen(
    createApp({
      supabaseAdmin: admin,
      prisma: createPrismaDouble(staffUsers),
      // Sin doble, la aprobación dispara el mail real de confirmación de pago.
      brevo: { configured: false, send: async () => ({ messageId: 'integration-noop' }) },
      env: { ...process.env, APP_PRODUCTION: 'true', PAYMENTS_MOCK: 'false' },
    }),
  )

  afterAll(async () => {
    await target.close()
    for (const athleteId of athleteIds) {
      await admin.rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: 'manual-approval-credential-cleanup',
      })
      await admin.from('domain_audit_logs').delete().eq('actor_id', athleteId)
      await admin.from('domain_audit_logs').delete().eq('entity_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('entity_id', athleteId)
    }
  })

  async function financeCookie() {
    if (staffCookie) return staffCookie
    const user = await buildStaffUser({ email: 'finanzas-credential@pluarg.test' })
    staffUsers.push(user)
    staffCookie = (await loginStaff(target.url, { email: user.email })).cookie
    return staffCookie
  }

  it('aprueba afiliación e inscripción por transferencia y deja el QR al día', async () => {
    const athleteId = await createTestAthlete(admin, {
      email: `manual-approval-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)

    const credential = await admin
      .from('athletes')
      .select('credential_token')
      .eq('id', athleteId)
      .single()
    if (credential.error) throw new Error(credential.error.message)

    const athleteCookie = await athleteSessionCookie(admin, athleteId)
    const plan = await admin
      .from('membership_plans')
      .select('code')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .is('retired_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)

    // 1. El atleta elige transferencia para afiliación e inscripción.
    const orders = []
    for (const [path, body] of [
      [
        '/api/athletes/me/membership-orders',
        { planCode: plan.data.code, paymentMethod: 'manual_link', idempotencyKey: randomUUID() },
      ],
      [
        '/api/athletes/me/registrations',
        {
          eventSlug: EVENT_SLUG,
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'manual_link',
          idempotencyKey: randomUUID(),
        },
      ],
    ]) {
      const response = await fetch(`${target.url}${path}`, {
        method: 'POST',
        headers: authHeaders(athleteCookie),
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      expect(response.status, `${path}: ${JSON.stringify(payload)}`).toBe(201)
      expect(payload.order.manual_payment_channel).toBe('bank_transfer')
      orders.push(payload.order)
    }

    // 2. Sube el comprobante de cada una con su propia sesión.
    for (const order of orders) {
      const response = await fetch(
        `${target.url}/api/athletes/me/payment-orders/${order.id}/proof`,
        {
          method: 'POST',
          headers: authHeaders(athleteCookie),
          body: JSON.stringify({ proofPath: `${order.id}/comprobante.pdf` }),
        },
      )
      expect(response.status, `proof ${order.id}: ${await response.text()}`).toBe(200)
    }

    // 3. Con el comprobante arriba las dos pasan a `validacion_manual`: es la
    //    bandeja concreta que mira Finanzas, no el `pendiente` genérico.
    const cookie = await financeCookie()
    const pending = await fetch(
      `${target.url}/api/athletes/admin/payment-orders?status=validacion_manual&limit=200`,
      { headers: authHeaders(cookie) },
    )
    const pendingBody = await pending.json()
    expect(pending.status, JSON.stringify(pendingBody)).toBe(200)
    const pendingIds = pendingBody.orders.map((order) => order.id)
    for (const order of orders) expect(pendingIds).toContain(order.id)

    // 4. Finanzas aprueba por HTTP, con permiso real.
    for (const order of orders) {
      const response = await fetch(
        `${target.url}/api/athletes/admin/payment-orders/${order.id}/approve`,
        { method: 'POST', headers: authHeaders(cookie) },
      )
      const payload = await response.json()
      expect(response.status, `approve ${order.id}: ${JSON.stringify(payload)}`).toBe(200)
      expect(payload.order.status).toBe('aprobado')
    }

    // 5. El atleta ya está inscripto: es lo que lee su propia cuenta.
    const session = await fetch(`${target.url}/api/athletes/session`, {
      headers: authHeaders(athleteCookie),
    })
    const sessionBody = await session.json()
    expect(session.status, JSON.stringify(sessionBody)).toBe(200)
    expect(sessionBody.memberships?.some((item) => item.status === 'activa')).toBe(true)
    // El snapshot anida cada inscripción con su evento, check-in y cronograma.
    expect(
      sessionBody.registrations?.some(
        (item) => item.registration?.status === 'confirmada' && item.event?.slug === EVENT_SLUG,
      ),
    ).toBe(true)
    // El QR se imprime sobre el token estable del atleta, no sobre la orden ni
    // sobre la membresía: sigue siendo el mismo antes y después de aprobar.
    expect(sessionBody.athlete?.credential_token).toBe(credential.data.credential_token)

    // 6. Y la puerta resuelve ese mismo QR con la información nueva.
    const resolved = await admin.rpc('get_membership_by_code_or_token', {
      p_code: credential.data.credential_token,
      p_event_slug: EVENT_SLUG,
    })
    if (resolved.error) throw new Error(resolved.error.message)
    expect(resolved.data.membership.status).toBe('activa')
    expect(resolved.data.registration).toMatchObject({
      status: 'confirmada',
      event_slug: EVENT_SLUG,
    })
  })

  it('rechaza el comprobante y deja al atleta libre de reintentar', async () => {
    const athleteId = await createTestAthlete(admin, {
      email: `manual-rejection-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)

    const athleteCookie = await athleteSessionCookie(admin, athleteId)
    const plan = await admin
      .from('membership_plans')
      .select('code')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .is('retired_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)

    const created = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(athleteCookie),
      body: JSON.stringify({
        planCode: plan.data.code,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)

    // Sin comprobante no hay nada que rechazar (PLU10): el rechazo es la
    // revisión de una evidencia concreta, no una cancelación administrativa.
    const proof = await fetch(
      `${target.url}/api/athletes/me/payment-orders/${createdBody.order.id}/proof`,
      {
        method: 'POST',
        headers: authHeaders(athleteCookie),
        body: JSON.stringify({ proofPath: `${createdBody.order.id}/comprobante.pdf` }),
      },
    )
    expect(proof.status, `proof: ${await proof.text()}`).toBe(200)

    const cookie = await financeCookie()
    const rejected = await fetch(
      `${target.url}/api/athletes/admin/payment-orders/${createdBody.order.id}/reject`,
      {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ reason: 'Comprobante ilegible.' }),
      },
    )
    const rejectedBody = await rejected.json()
    expect(rejected.status, JSON.stringify(rejectedBody)).toBe(200)
    expect(rejectedBody.order.status).toBe('rechazado')

    // El rechazo no puede dejar la afiliación del año trabada: el socio tiene
    // que poder arrancar otra orden sin esperar el vencimiento.
    const retry = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(athleteCookie),
      body: JSON.stringify({
        planCode: plan.data.code,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const retryBody = await retry.json()
    expect(retry.status, JSON.stringify(retryBody)).toBe(201)
    expect(retryBody.order.id).not.toBe(createdBody.order.id)
    expect(retryBody.order.status).not.toBe('rechazado')
  })
})
