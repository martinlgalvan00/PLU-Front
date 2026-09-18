import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261127100000_staff_manual_ticket_order.sql',
  'utf8',
)

describe('migración: venta de entradas de mostrador (create_ticket_order_v3)', () => {
  it('agrega p_staff_actor como sexto parámetro, opcional', () => {
    expect(migration).toContain(
      'create or replace function public.create_ticket_order_v3(',
    )
    expect(migration).toMatch(/p_staff_actor text default null\s*\)/)
  })

  it('saltea las ventanas de venta online sólo cuando hay actor de staff', () => {
    const body = migration.slice(
      migration.indexOf('create or replace function public.create_ticket_order_v3('),
      migration.indexOf('$$;', migration.indexOf('create or replace function public.create_ticket_order_v3(')),
    )
    expect(body).toContain('if p_staff_actor is null then')
    expect(body).toContain('La venta de entradas todavia no abrio.')
    expect(body).toContain('La venta de entradas esta deshabilitada para este evento.')
    expect(body).toMatch(
      /if p_staff_actor is null then\s*if v_type\.sales_opens_at is not null/,
    )
  })

  it('mantiene el status del evento y el cupo sin condicionar al actor', () => {
    const body = migration.slice(
      migration.indexOf('create or replace function public.create_ticket_order_v3('),
      migration.indexOf('$$;', migration.indexOf('create or replace function public.create_ticket_order_v3(')),
    )
    // El chequeo de status (cerrado/finalizado) y el de cupo quedan afuera del
    // bloque condicional: un alta de mostrador no reabre un evento cerrado ni
    // sobrevende.
    const statusCheckIndex = body.indexOf("v_event.status in ('cerrado', 'finalizado')")
    const staffGuardIndex = body.indexOf('if p_staff_actor is null then')
    expect(statusCheckIndex).toBeGreaterThan(-1)
    expect(statusCheckIndex).toBeLessThan(staffGuardIndex)
    expect(body).toContain("raise exception 'Evento agotado.' using errcode = 'PLU04';")
  })

  it('audita como staff con el actor cuando la orden viene del panel', () => {
    expect(migration).toContain(
      "insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)",
    )
    expect(migration).toMatch(
      /case when p_staff_actor is not null then 'staff' else 'public' end,\s*p_staff_actor,/,
    )
  })

  it('deja v2 en pie y otorga permisos sólo a service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.create_ticket_order_v3(text, jsonb, jsonb, text, text, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.create_ticket_order_v3(text, jsonb, jsonb, text, text, text)\n  to service_role;',
    )
    expect(migration).not.toMatch(/drop function public\.create_ticket_order_v2/)
  })

  it('la verificación exige que v3 y v2 existan', () => {
    expect(migration).toContain(
      "to_regprocedure(\n    'public.create_ticket_order_v3(text,jsonb,jsonb,text,text,text)'\n  ) is null",
    )
    expect(migration).toContain(
      "to_regprocedure(\n    'public.create_ticket_order_v2(text,jsonb,jsonb,text,text)'\n  ) is null",
    )
  })
})
