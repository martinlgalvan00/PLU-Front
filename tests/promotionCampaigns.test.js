import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260905100000_promotion_campaigns_universal_redeem.sql',
  ),
  'utf8',
)

describe('campañas promocionales y canje universal', () => {
  it('separa experiencia, beneficio, código y eventos del embudo', () => {
    expect(migration).toContain('create table if not exists public.promotion_campaigns')
    expect(migration).toContain('create table if not exists public.promotion_campaign_benefits')
    expect(migration).toContain('add column if not exists campaign_id uuid')
    expect(migration).toContain('create table if not exists public.promotion_campaign_events')
  })

  it('no expone las tablas de campañas directamente a atletas', () => {
    for (const table of [
      'promotion_campaigns',
      'promotion_campaign_benefits',
      'promotion_campaign_events',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated`)
    }
  })

  it('resuelve cualquier código sin confirmar pagos en el canje', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.athlete_redeem_promotion_code'),
      migration.indexOf('create or replace function public.staff_simulate_promotion_code'),
    )
    expect(resolver).toContain("v_action := 'open_exclusive_offer'")
    expect(resolver).toContain("v_action := 'apply_to_checkout'")
    expect(resolver).not.toContain('update public.athlete_payment_orders')
    expect(resolver).not.toContain("status = 'aprobado'")
  })

  it('provee simulación y analítica sólo para service_role', () => {
    expect(migration).toContain('create or replace function public.staff_simulate_promotion_code')
    expect(migration).toContain(
      'create or replace function public.staff_get_promotion_campaign_analytics',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_simulate_promotion_code(uuid) to service_role',
    )
  })
})
