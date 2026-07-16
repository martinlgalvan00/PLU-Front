import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260716000000_infrastructure_hardening.sql'),
  'utf8',
)
const ticketApi = fs.readFileSync(path.resolve('src/services/ticketApi.js'), 'utf8')
const athleteApi = fs.readFileSync(path.resolve('src/services/athleteApi.js'), 'utf8')

describe('infraestructura transaccional endurecida', () => {
  it('usa sesiones opacas y revoca mutaciones publicas por UUID', () => {
    expect(migration).toContain('create table if not exists public.athlete_sessions')
    expect(migration).toContain('revoke all on function public.get_athlete_snapshot(uuid) from public, anon, authenticated')
    expect(migration).toContain('revoke all on function public.update_athlete_profile')
    expect(migration).toContain('revoke all on function public.staff_check_in_ticket')
    expect(migration).toContain('revoke all on function public.create_ticket_order_v2')
    expect(migration).toContain("update storage.buckets set public = false where id = 'athlete-photos'")
    expect(migration).toContain('drop policy if exists ticket_proofs_insert_buyer')
  })

  it('crea ordenes idempotentes con cupos bloqueados y codigos por secuencia', () => {
    expect(migration).toContain('create or replace function public.create_ticket_order_v2')
    expect(migration).toContain('where slug = p_event_slug for update')
    expect(migration).toContain("nextval('public.ticket_code_seq')")
    expect(migration).toContain('reservation_expires_at')
    expect(migration).toContain('create or replace function public.expire_ticket_reservations')
  })

  it('proyecta cada renovacion sobre su ciclo objetivo', () => {
    expect(migration).toContain('create table if not exists public.membership_order_targets')
    expect(migration).toContain('create or replace function public.project_membership_order_target')
    expect(migration).toContain('after update of status on public.athlete_payment_orders')
  })

  it('el navegador escribe los dominios sensibles solamente por Express', () => {
    expect(ticketApi).not.toContain("callRpc('create_ticket_order'")
    expect(ticketApi).not.toContain("callRpc('check_in_ticket'")
    expect(athleteApi).not.toContain("callRpc('get_athlete_snapshot'")
    expect(athleteApi).not.toContain("callRpc('create_membership_order'")
    expect(athleteApi).toContain("apiPost('/api/athletes/me/membership-orders'")
  })
})
