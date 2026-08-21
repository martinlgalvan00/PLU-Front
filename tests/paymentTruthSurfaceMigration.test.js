import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260907100000_payment_truth_surface.sql'),
  'utf8',
)

describe('vencimiento de órdenes: nunca sobre un comprobante sin revisar', () => {
  it('redefine expire_domain_orders excluyendo las órdenes con comprobante', () => {
    expect(migration).toContain('create or replace function public.expire_domain_orders(')
    expect(migration).toContain('and o.payment_proof_uploaded_at is null')
  })

  it('mantiene la guarda de intentos embebidos en vuelo', () => {
    // La corrección suma una condición; no puede perder la que ya existía.
    expect(migration).toContain("a.status in ('processing', 'submitted')")
  })

  it('sigue venciendo las órdenes sin comprobante', () => {
    expect(migration).toContain("where o.status in ('pendiente', 'validacion_manual')")
    expect(migration).toContain('o.expires_at <= p_now')
  })

  it('informa cuántas retuvo en vez de callarlas', () => {
    expect(migration).toContain("'heldForReview'")
  })
})

describe('snapshot del atleta: libro de intentos, sin payload del proveedor', () => {
  it('saca provider_payload de las órdenes que viajan al browser', () => {
    expect(migration).toContain('create or replace function public.get_athlete_snapshot(')
    expect(migration).toContain("(to_jsonb(o.*) - 'provider_payload')")
  })

  it('agrega los intentos desde athlete_payments sin el raw_payload', () => {
    expect(migration).toContain("'attempts'")
    expect(migration).toContain('from public.athlete_payments p where p.order_id = o.id')
    // `raw_payload` es justamente el peso que se está sacando: no puede volver
    // por la puerta de los intentos. (La palabra aparece en los comentarios;
    // lo que no puede aparecer es la columna proyectada.)
    expect(migration).not.toContain('p.raw_payload')
  })

  it('conserva el resto del snapshot', () => {
    for (const key of ["'athlete'", "'memberships'", "'registrations'", "'paymentOrders'"]) {
      expect(migration).toContain(key)
    }
    expect(migration).toContain('plu_private.registration_schedule(r)')
  })

  it('no afloja los permisos de ninguna de las dos funciones', () => {
    expect(migration).toContain(
      'revoke all on function public.get_athlete_snapshot(uuid)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'revoke all on function public.expire_domain_orders(timestamptz)\n  from public, anon, authenticated;',
    )
  })

  it('verifica el resultado dentro de la propia migración', () => {
    expect(migration).toContain('do $verification$')
    expect(migration).toContain('PLU01')
  })
})
