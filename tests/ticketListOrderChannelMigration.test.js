import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261129100000_ticket_list_order_channel.sql',
  'utf8',
)

describe('migración: staff_list_tickets_for_event suma canal de pago y comprador', () => {
  it('mantiene la firma (text -> jsonb) y las claves ticket/checkIn existentes', () => {
    expect(migration).toContain(
      'create or replace function public.staff_list_tickets_for_event(p_event_slug text)',
    )
    expect(migration).toContain(
      "'ticket', to_jsonb(t.*) || jsonb_build_object('ticketTypeName', tt.name),",
    )
    expect(migration).toContain("'checkIn', to_jsonb(c.*),")
  })

  it('agrega el join a ticket_orders y la clave order en snake_case', () => {
    expect(migration).toContain('left join public.ticket_orders o on o.id = t.order_id')
    expect(migration).toMatch(
      /'order', case when o\.id is null then null else jsonb_build_object\(/,
    )
    for (const field of [
      "'id', o.id",
      "'reference', o.reference",
      "'status', o.status",
      "'provider', o.provider",
      "'manual_payment_channel', o.manual_payment_channel",
      "'buyer_name', o.buyer_name",
      "'buyer_email', o.buyer_email",
    ]) {
      expect(migration).toContain(field)
    }
  })

  it('una entrada sin orden asociada devuelve order en null, no una fila vacía', () => {
    expect(migration).toContain('case when o.id is null then null else')
  })

  it('mantiene los grants sólo para service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_list_tickets_for_event(text) from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_list_tickets_for_event(text) to service_role;',
    )
  })

  it('la verificación exige que la función siga existiendo', () => {
    expect(migration).toContain("to_regprocedure('public.staff_list_tickets_for_event(text)') is null")
  })
})
