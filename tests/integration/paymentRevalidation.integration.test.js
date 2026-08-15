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
 * Revalidacion contra Mercado Pago, contra la base real.
 *
 * El caso: la orden figura `cancelado` en el panel y la plata entro igual. Los
 * tests unitarios verifican que el workflow elija el pago correcto y llame al
 * repositorio; lo que decide si el socio queda afiliado es la RPC, y eso
 * necesita Postgres: una orden cancelada tiene que poder volver a `aprobado`
 * cuando aparece una fila de pago aprobada, activar la membresia y dejar la
 * correccion asentada en la bitacora.
 *
 * Tambien fija el limite: si Mercado Pago no tiene ningun pago, revalidar no
 * acredita nada. Esa es toda la diferencia entre esto y acreditar a mano.
 */

const admin = createSupabaseTestClient()
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
const AMOUNT = 92_000

let target
let cookie
let athleteId
let cancelledOrderId
let membershipId
let orphanOrderId
const externalPaymentId = `reval-int-${randomUUID().slice(0, 12)}`

function approvedPayment(orderId) {
  return {
    id: externalPaymentId,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: AMOUNT,
    currency_id: 'ARS',
    external_reference: orderId,
    date_created: new Date().toISOString(),
    date_approved: new Date().toISOString(),
    payer: { email: 'revalidacion@pluarg.test' },
  }
}

beforeAll(async () => {
  const athlete = await admin
    .from('athletes')
    .insert({
      organization_id: ORGANIZATION_ID,
      full_name: 'Atleta Revalidacion',
      document_id: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
      email: `revalidacion-${randomUUID()}@pluarg.test`,
      birth_date: '1992-02-02',
      phone: '1122334455',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'La Plata',
      gym: 'Box Test',
      sex: 'Femenino',
      status: 'registrado',
    })
    .select('id')
    .single()
  if (athlete.error) throw new Error(athlete.error.message)
  athleteId = athlete.data.id

  // La orden que el proveedor dio por perdida: el intento fallido queda en el
  // ledger, que es lo que la deja en `cancelado`.
  const order = await admin
    .from('athlete_payment_orders')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      concept: 'membership',
      amount: AMOUNT,
      currency: 'ARS',
      method: 'mercado_pago',
      status: 'cancelado',
      reference: `REVAL-${randomUUID().slice(0, 8)}`,
      payer_email: 'revalidacion@pluarg.test',
    })
    .select('id')
    .single()
  if (order.error) throw new Error(order.error.message)
  cancelledOrderId = order.data.id

  const failedAttempt = await admin.from('athlete_payments').insert({
    organization_id: ORGANIZATION_ID,
    order_id: cancelledOrderId,
    external_payment_id: `${externalPaymentId}-cancelado`,
    status: 'cancelado',
    amount: AMOUNT,
    currency: 'ARS',
    status_detail: 'expired',
  })
  if (failedAttempt.error) throw new Error(failedAttempt.error.message)

  const membership = await admin
    .from('memberships')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      year: String(new Date().getFullYear()),
      status: 'pendiente_pago',
      member_code: `RV-${randomUUID().slice(0, 8)}`,
      payment_order_id: cancelledOrderId,
    })
    .select('id')
    .single()
  if (membership.error) throw new Error(membership.error.message)
  membershipId = membership.data.id

  // Segunda orden: pendiente y sin ningun pago del lado del proveedor.
  const orphan = await admin
    .from('athlete_payment_orders')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      concept: 'registration',
      amount: AMOUNT,
      currency: 'ARS',
      method: 'mercado_pago',
      status: 'pendiente',
      reference: `REVAL-VACIA-${randomUUID().slice(0, 8)}`,
    })
    .select('id')
    .single()
  if (orphan.error) throw new Error(orphan.error.message)
  orphanOrderId = orphan.data.id

  const staffUser = await buildStaffUser({ email: 'staff-revalidacion@pluarg.test' })
  target = listen(
    createApp({
      prisma: createPrismaDouble([staffUser]),
      supabaseAdmin: admin,
      mercadoPago: {
        // Solo la orden cancelada tiene un cobro del otro lado.
        async searchPaymentsForOrder(order) {
          return order.id === cancelledOrderId ? [approvedPayment(cancelledOrderId)] : []
        },
        async getPayment(id) {
          return { ...approvedPayment(cancelledOrderId), id: String(id) }
        },
      },
      notifyPaymentApplied: async () => {},
      env: { ...process.env, APP_PRODUCTION: 'false' },
    }),
  )
  ;({ cookie } = await loginStaff(target.url, { email: staffUser.email }))
})

afterAll(async () => {
  for (const id of [cancelledOrderId, orphanOrderId].filter(Boolean)) {
    await admin.from('operational_event_logs').delete().eq('entity_id', id)
    await admin.from('membership_cycles').delete().eq('order_id', id)
    await admin.from('athlete_payments').delete().eq('order_id', id)
  }
  if (membershipId) await admin.from('memberships').delete().eq('id', membershipId)
  for (const id of [cancelledOrderId, orphanOrderId].filter(Boolean)) {
    await admin.from('athlete_payment_orders').delete().eq('id', id)
  }
  if (athleteId) {
    await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
    await admin.from('athletes').delete().eq('id', athleteId)
  }
  await target?.close()
})

async function revalidate(orderId, body = {}) {
  const response = await fetch(`${target.url}/api/payments/orders/${orderId}/revalidate`, {
    method: 'POST',
    headers: authHeaders(cookie),
    body: JSON.stringify(body),
  })
  return { response, body: await response.json() }
}

describe('revalidacion contra el proveedor end-to-end', () => {
  it('exige sesion de staff', async () => {
    const response = await fetch(`${target.url}/api/payments/orders/${cancelledOrderId}/revalidate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(401)
  })

  it('en modo diagnostico reporta la divergencia sin tocar la orden', async () => {
    const { response, body } = await revalidate(cancelledOrderId, { apply: false })

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.localStatus).toBe('cancelado')
    expect(body.providerStatus).toBe('aprobado')
    expect(body.divergent).toBe(true)
    expect(body.applied).toBe(false)

    const order = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', cancelledOrderId)
      .single()
    expect(order.data.status).toBe('cancelado')
  })

  it('corrige la orden cancelada y activa la afiliacion con el pago del proveedor', async () => {
    const { response, body } = await revalidate(cancelledOrderId, { apply: true })

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.corrected).toBe(true)
    expect(body.resultStatus).toBe('aprobado')

    const [order, payments, membership, athlete] = await Promise.all([
      admin.from('athlete_payment_orders').select('status, approved_at').eq('id', cancelledOrderId).single(),
      admin.from('athlete_payments').select('external_payment_id, status').eq('order_id', cancelledOrderId),
      admin.from('memberships').select('status').eq('id', membershipId).single(),
      admin.from('athletes').select('status').eq('id', athleteId).single(),
    ])

    expect(order.data.status).toBe('aprobado')
    expect(order.data.approved_at).toBeTruthy()
    // El intento cancelado sigue existiendo: la forense necesita poder
    // reconstruir que paso, no una version prolija de la historia.
    expect(payments.data).toHaveLength(2)
    expect(payments.data.filter((row) => row.status === 'aprobado')).toHaveLength(1)
    expect(membership.data.status).toBe('activa')
    expect(athlete.data.status).toBe('afiliado_activo')
  })

  it('deja la correccion asentada en la bitacora', async () => {
    const trail = await admin
      .from('operational_event_logs')
      .select('action, severity, metadata')
      .eq('entity_id', cancelledOrderId)
      .eq('source', 'payment')

    const revalidacion = trail.data.find((row) => row.action === 'payment.revalidated')
    expect(revalidacion, JSON.stringify(trail.data?.map((row) => row.action))).toBeTruthy()
    expect(revalidacion.metadata.localStatus).toBe('cancelado')
    expect(revalidacion.metadata.providerStatus).toBe('aprobado')
    // Queda firmada: quien la ejecuto viaja en el asiento.
    expect(revalidacion.metadata.actor).toContain('staff-revalidacion@pluarg.test')
  })

  it('repetirla sobre una orden ya al dia no cambia nada', async () => {
    const { response, body } = await revalidate(cancelledOrderId, { apply: true })

    expect(response.status).toBe(200)
    expect(body.outcome).toBe('in_sync')
    expect(body.corrected).toBe(false)

    const payments = await admin
      .from('athlete_payments')
      .select('id')
      .eq('order_id', cancelledOrderId)
    expect(payments.data).toHaveLength(2)
  })

  it('sin pago en el proveedor no acredita nada', async () => {
    // El limite del mecanismo: revalidar relee la verdad de Mercado Pago, no
    // inventa cobros. Para eso esta la acreditacion manual, con comprobante.
    const { response, body } = await revalidate(orphanOrderId, { apply: true })

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.outcome).toBe('no_provider_payment')
    expect(body.providerStatus).toBeNull()

    const order = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', orphanOrderId)
      .single()
    expect(order.data.status).toBe('pendiente')
  })

  it('el barrido encuentra la orden divergente sin escribir', async () => {
    // Se corre antes de corregir nada mas: `apply` en false es el default.
    const response = await fetch(`${target.url}/api/payments/operations/revalidate`, {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify({ sinceDays: 1, limit: 50 }),
    })
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.summary.apply).toBe(false)
    expect(body.summary.checked).toBeGreaterThan(0)
    // La orden sin pagos entra en el barrido y no cuenta como divergencia.
    const orphan = body.results.find((item) => item.order?.id === orphanOrderId)
    expect(orphan?.outcome).toBe('no_provider_payment')
  })
})
