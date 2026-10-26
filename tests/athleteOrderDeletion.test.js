import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canDeleteAthleteOrder } from '../src/services/paymentValidationService.js'

const sql = readFileSync(
  'supabase/migrations/20261228110000_staff_delete_athlete_payment_order.sql',
  'utf8',
)

describe('canDeleteAthleteOrder', () => {
  const base = { id: 'o1', status: 'cancelado', method: 'manual_link' }

  it.each(['cancelado', 'rechazado', 'pendiente', 'validacion_manual', 'creado'])(
    'una orden %s sin movimientos se puede borrar',
    (status) => {
      expect(canDeleteAthleteOrder({ ...base, status })).toBe(true)
    },
  )

  it.each(['aprobado', 'reembolsado'])('una orden %s se conserva: es plata cobrada', (status) => {
    expect(canDeleteAthleteOrder({ ...base, status })).toBe(false)
  })

  it('con comprobante adjunto no: primero va a la papelera', () => {
    expect(canDeleteAthleteOrder({ ...base, paymentProofPath: 'orders/o1.pdf' })).toBe(false)
  })

  it('una abierta con el pago declarado no: Finanzas tiene que revisarla', () => {
    expect(
      canDeleteAthleteOrder({
        ...base,
        status: 'validacion_manual',
        manualPaymentDeclaredAt: '2026-10-01T10:00:00Z',
      }),
    ).toBe(false)
  })

  it('una cerrada con el pago declarado sí: ya no espera revisión', () => {
    expect(
      canDeleteAthleteOrder({
        ...base,
        status: 'cancelado',
        manualPaymentDeclaredAt: '2026-10-01T10:00:00Z',
      }),
    ).toBe(true)
  })

  it('un combo financiado con derechos otorgados no', () => {
    expect(
      canDeleteAthleteOrder({
        ...base,
        status: 'pendiente',
        financedEntitlementsAt: '2026-10-01T10:00:00Z',
      }),
    ).toBe(false)
  })

  it('si los derechos financiados se revocaron, vuelve a ser borrable', () => {
    expect(
      canDeleteAthleteOrder({
        ...base,
        status: 'rechazado',
        financedEntitlementsAt: '2026-10-01T10:00:00Z',
        financedEntitlementsRevokedAt: '2026-10-05T10:00:00Z',
      }),
    ).toBe(true)
  })

  it('sin orden no hay nada que borrar', () => {
    expect(canDeleteAthleteOrder(null)).toBe(false)
  })
})

describe('migración staff_delete_athlete_payment_order', () => {
  it('rechaza lo cobrado, con comprobante, declarado, en vuelo o con historial', () => {
    expect(sql).toContain("v_order.status in ('aprobado', 'reembolsado')")
    for (const code of ['PLU31', 'PLU32', 'PLU33', 'PLU34', 'PLU35']) {
      expect(sql).toContain(`errcode = '${code}'`)
    }
    expect(sql).toContain('public.athlete_payments where order_id')
    expect(sql).toContain('public.billing_subscriptions where initial_order_id')
  })

  it('exige actor y motivo, y deja la baja en la auditoría con una foto de la orden', () => {
    expect(sql).toContain("raise exception 'Falta el actor de la baja.'")
    expect(sql).toContain("raise exception 'Indicá el motivo de la baja.'")
    expect(sql).toContain("'payment_order.deleted'")
    expect(sql).toContain("'snapshot', v_snapshot")
  })

  it('una orden abierta se cancela antes: cupón devuelto e inscripción liberada', () => {
    expect(sql).toContain('plu_private.release_order_discount(v_order.id)')
    expect(sql).toContain("cancellation_code = 'cancelled_by_staff'")
    expect(sql).toContain("set status = 'cancelada'")
  })

  it('suelta el vínculo de afiliación que impide el delete y no borra la afiliación', () => {
    expect(sql).toContain('delete from public.membership_order_targets where order_id')
    expect(sql).not.toMatch(/delete\s+from\s+public\.memberships/i)
    expect(sql).not.toMatch(/delete\s+from\s+public\.event_registrations/i)
  })

  it('solo la ejecuta service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.staff_delete_athlete_payment_order\(uuid, text, text\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_delete_athlete_payment_order\(uuid, text, text\)\s+to service_role/,
    )
  })
})
