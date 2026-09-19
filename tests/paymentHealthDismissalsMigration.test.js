import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261129120000_payment_health_dismissals.sql',
  'utf8',
)

describe('migración: descartar un drift no crítico sin que contamine Diagnóstico', () => {
  it('crea la tabla de descartes con un único descarte activo por orden', () => {
    expect(migration).toContain('create table public.payment_health_dismissals')
    expect(migration).toContain(
      "check (order_kind in ('athlete', 'ticket'))",
    )
    expect(migration).toContain("check (length(btrim(reason)) >= 3)")
    expect(migration).toContain(
      'create unique index payment_health_dismissals_active_uidx\n  on public.payment_health_dismissals (order_kind, order_id)\n  where restored_at is null;',
    )
  })

  it('la lectura queda restringida a staff', () => {
    expect(migration).toContain(
      'create policy "payment_health_dismissals_staff_read" on public.payment_health_dismissals\n  for select to authenticated using (public.can_view_admin_data());',
    )
  })

  it('staff_dismiss_payment_drift exige motivo y rechaza descartar una orden que ya no está desalineada', () => {
    expect(migration).toContain(
      'create or replace function public.staff_dismiss_payment_drift(',
    )
    expect(migration).toContain(
      "if p_reason is null or length(btrim(p_reason)) < 3 then\n    raise exception 'El descarte de un hallazgo exige un motivo.' using errcode = 'PLU01';",
    )
    expect(migration).toContain(
      "if v_local = v_expected then\n    raise exception 'La orden ya no esta desalineada: no hay nada que descartar.'",
    )
  })

  it('el descarte es idempotente por orden vía on conflict sobre el índice parcial', () => {
    expect(migration).toContain(
      'on conflict (order_kind, order_id) where restored_at is null\n  do update set',
    )
  })

  it('staff_restore_payment_drift_dismissal sólo restaura un descarte activo', () => {
    expect(migration).toContain(
      'create or replace function public.staff_restore_payment_drift_dismissal(',
    )
    expect(migration).toContain('where id = p_dismissal_id and restored_at is null')
  })

  it('get_payment_system_health resta el drift descartado de los contadores y de healthy', () => {
    expect(migration).toContain('create or replace function public.get_payment_system_health()')
    expect(migration).toMatch(
      /athlete_open as \(\s*select ar\.\* from athlete_rollup ar\s*where ar\.status <> ar\.expected_status\s*and not exists \(/,
    )
    expect(migration).toMatch(
      /ticket_open as \(\s*select tr\.\* from ticket_rollup tr\s*where tr\.status <> tr\.expected_status\s*and not exists \(/,
    )
    expect(migration).toContain("'healthy', athlete_drift = 0 and ticket_drift = 0")
  })

  it('devuelve el detalle de las órdenes que siguen abiertas, no sólo el conteo', () => {
    expect(migration).toContain("'openAthleteDrift', (")
    expect(migration).toContain("'openTicketDrift', (")
    expect(migration).toContain("'dismissedDrift', dismissed_drift,")
  })

  it('el schema version reportado sigue a esta migración', () => {
    expect(migration).toContain("select '20261129120000'::text;")
  })

  it('mantiene los grants sólo para service_role en las tres RPCs nuevas', () => {
    for (const fn of [
      'staff_dismiss_payment_drift(text, uuid, text, text)',
      'staff_restore_payment_drift_dismissal(uuid, text)',
      'list_payment_drift_dismissals(int)',
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}\n  from public, anon, authenticated;`)
      expect(migration).toContain(`grant execute on function public.${fn}`)
    }
  })

  it('la verificación exige que la tabla y las cuatro funciones sigan existiendo', () => {
    expect(migration).toContain("to_regclass('public.payment_health_dismissals') is null")
    expect(migration).toContain(
      "to_regprocedure('public.staff_dismiss_payment_drift(text,uuid,text,text)') is null",
    )
    expect(migration).toContain(
      "to_regprocedure('public.staff_restore_payment_drift_dismissal(uuid,text)') is null",
    )
    expect(migration).toContain(
      "to_regprocedure('public.list_payment_drift_dismissals(int)') is null",
    )
  })
})
