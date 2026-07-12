import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260711190000_data_infrastructure_v3_rls.sql'),
  'utf8',
)

describe('supabase multi-organization RLS contract', () => {
  it('define helpers seguros para membresia y roles por organizacion', () => {
    expect(migration).toContain('create or replace function public.is_org_member')
    expect(migration).toContain('create or replace function public.has_org_role')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public')
    expect(migration).toContain('auth.uid()')
  })

  it('habilita RLS en tablas operativas principales', () => {
    for (const table of [
      'organizations',
      'organization_members',
      'events',
      'memberships',
      'event_registrations',
      'ticket_orders',
      'tickets',
      'payment_orders',
      'payments',
      'audit_logs',
      'integration_events',
    ]) {
      expect(migration).toContain(`alter table if exists public.${table} enable row level security;`)
    }
  })

  it('declara policies por organization_id y vistas publicas acotadas', () => {
    expect(migration).toContain('public.can_read_org_row(organization_id)')
    expect(migration).toContain('public.can_write_org_row(organization_id)')
    expect(migration).toContain('create or replace view public.public_events_view')
    expect(migration).toContain('where e.visibility_status =')
  })
})
