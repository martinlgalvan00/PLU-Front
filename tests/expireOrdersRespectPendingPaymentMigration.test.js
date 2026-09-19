import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261129110000_expire_orders_respect_pending_payment_signal.sql',
  'utf8',
)

describe('migración: el vencimiento automático no cancela órdenes con un pago en curso', () => {
  it('expire_ticket_reservations no toca una orden con un ticket_payments pendiente', () => {
    expect(migration).toContain(
      'create or replace function public.expire_ticket_reservations(p_now timestamptz default now())',
    )
    expect(migration).toMatch(
      /and not exists \(\s*select 1 from public\.ticket_payments p\s*where p\.order_id = o\.id and p\.status = 'pendiente'\s*\)/,
    )
  })

  it('expire_ticket_reservations conserva la guarda de intentos embebidos en vuelo', () => {
    expect(migration).toContain(
      "where a.order_kind = 'ticket' and a.order_id = o.id\n          and a.status in ('processing', 'submitted')",
    )
  })

  it('expire_domain_orders no toca una orden de atleta con un athlete_payments pendiente', () => {
    expect(migration).toContain(
      'create or replace function public.expire_domain_orders(p_now timestamptz default now())',
    )
    expect(migration).toMatch(
      /and not exists \(\s*select 1 from public\.athlete_payments p\s*where p\.order_id = o\.id and p\.status = 'pendiente'\s*\)/,
    )
  })

  it('expire_domain_orders conserva la guarda de comprobante adjunto', () => {
    expect(migration).toContain('and o.payment_proof_uploaded_at is null')
  })

  it('las órdenes creado/pendiente sin ningún pago siguen venciendo igual', () => {
    expect(migration).toContain("where o.status in ('creado', 'pendiente')")
    expect(migration).toContain(
      "where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= p_now",
    )
  })

  it('mantiene los grants sólo para service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.expire_ticket_reservations(timestamptz)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.expire_ticket_reservations(timestamptz) to service_role;',
    )
    expect(migration).toContain(
      'revoke all on function public.expire_domain_orders(timestamptz)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.expire_domain_orders(timestamptz) to service_role;',
    )
  })

  it('la verificación exige que ambas funciones sigan existiendo', () => {
    expect(migration).toContain(
      "to_regprocedure('public.expire_ticket_reservations(timestamptz)') is null",
    )
    expect(migration).toContain(
      "to_regprocedure('public.expire_domain_orders(timestamptz)') is null",
    )
  })
})
