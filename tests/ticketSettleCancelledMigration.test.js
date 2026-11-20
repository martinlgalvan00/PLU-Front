import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20271117120000_ticket_settle_cancelled_proof.sql',
  'utf8',
).replace(/\r\n/g, '\n')

describe('migración: acreditar de una una entrada cancelada con comprobante', () => {
  it('reabre y aprueba en la misma transacción, y no toca una orden ya pendiente', () => {
    expect(migration).toContain(
      'create or replace function public.staff_settle_cancelled_ticket_order(',
    )
    expect(migration).toContain('public.staff_reopen_cancelled_ticket_order(p_order_id, p_actor, p_reason)')
    expect(migration).toContain('public.staff_approve_ticket_order(p_order_id, p_actor, null)')
    expect(migration).toContain("using errcode = 'PLU03'")
    expect(migration).toContain(
      'revoke all on function public.staff_settle_cancelled_ticket_order(uuid, text, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_settle_cancelled_ticket_order(uuid, text, text)\n  to service_role;',
    )
  })
})
