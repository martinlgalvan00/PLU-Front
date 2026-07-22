import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260721000000_supabase_linter_remediation.sql',
  ),
  'utf8',
)

describe('Supabase advisor remediation', () => {
  it('fija el search_path de todos los helpers informados', () => {
    for (const signature of [
      'ticket_price_for_day_pass(text)',
      'event_ticket_addons_catalog(jsonb)',
      'ticket_addons_total_and_snapshot(jsonb, jsonb)',
      'membership_price()',
      'registration_price()',
      'athlete_payment_status_for_method(text)',
      'next_member_code(text)',
    ]) {
      expect(migration).toContain(`alter function public.${signature}`)
    }
    expect(migration).toContain('set search_path = pg_catalog;')
  })

  it('mueve implementaciones SECURITY DEFINER a un schema no expuesto', () => {
    expect(migration).toContain('create schema if not exists plu_private')
    expect(migration).toContain('alter function public.is_admin() set schema plu_private')
    expect(migration).toContain(
      'alter function public.get_ticket_by_qr_token(uuid) set schema plu_private',
    )
    expect(migration).toContain('security invoker')
    expect(migration).toContain('revoke all on all functions in schema plu_private')
  })

  it('cachea auth.uid y reemplaza policies ALL superpuestas', () => {
    expect(migration).toContain('using (id = (select auth.uid()))')
    expect(migration).toContain('with check (id = (select auth.uid()))')
    expect(migration).toContain('drop policy if exists events_write_admin')
    expect(migration).toContain('create policy events_insert_authenticated')
    expect(migration).toContain('create policy events_update_authenticated')
    expect(migration).toContain('create policy events_delete_authenticated')
    expect(migration).not.toMatch(/create policy\s+\w+\s+on public\.\w+\s+for all/i)
  })
})
