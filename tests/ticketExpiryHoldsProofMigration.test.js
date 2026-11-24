import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20271117100000_ticket_expiry_holds_proof.sql',
  'utf8',
).replace(/\r\n/g, '\n')

describe('migración: el vencimiento de entradas no se come un comprobante', () => {
  it('expire_ticket_reservations conserva la firma int y la guarda de comprobante', () => {
    expect(migration).toContain(
      'create or replace function public.expire_ticket_reservations(p_now timestamptz default now())\nreturns int',
    )
    expect(migration).toContain('and o.payment_proof_uploaded_at is null')
    expect(migration).toMatch(
      /and not exists \(\s*select 1 from public\.ticket_payments p\s*where p\.order_id = o\.id and p\.status = 'pendiente'\s*\)/,
    )
    expect(migration).toContain(
      "where a.order_kind = 'ticket' and a.order_id = o.id\n          and a.status in ('processing', 'submitted')",
    )
  })

  it('la reapertura no acredita y rechaza un rechazo de staff', () => {
    expect(migration).toContain(
      'create or replace function public.staff_reopen_cancelled_ticket_order(',
    )
    expect(migration).toContain("set status = 'pendiente'")
    expect(migration).toContain("set status = 'pendiente_pago'")
    expect(migration).toContain('reservation_expires_at = null')
    expect(migration).toContain("'ticket_order.reopened'")
    expect(migration).toContain("v_order.status = 'rechazado'")
    expect(migration).toContain("using errcode = 'PLU04'")
  })

  it('mantiene los grants sólo para service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.expire_ticket_reservations(timestamptz)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.expire_ticket_reservations(timestamptz) to service_role;',
    )
    expect(migration).toContain(
      'revoke all on function public.staff_reopen_cancelled_ticket_order(uuid, text, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_reopen_cancelled_ticket_order(uuid, text, text)\n  to service_role;',
    )
  })
})
