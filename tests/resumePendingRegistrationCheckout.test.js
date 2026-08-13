import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Reanudar checkout de inscripción pendiente (20260816120000).
 *
 * Una inscripción `pendiente_pago` no es "ya inscripto": es una orden a
 * completar. El atleta que cambia a link de pago tiene que ver transferencia,
 * no PLU08.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260816120000_resume_pending_registration_checkout.sql',
  ),
  'utf8',
)

describe('migración 20260816120000 — reanudar inscripción pendiente', () => {
  it('define el helper que reanuda o cambia el medio sin llegar al proveedor', () => {
    expect(migration).toContain('function public.resume_pending_event_registration_checkout')
    expect(migration).toContain("v_registration.status <> 'pendiente_pago'")
    expect(migration).toContain('v_can_switch')
    expect(migration).toContain('provider_preference_id is null')
    expect(migration).toContain("p_payment_method = 'manual_link'")
  })

  it('create_competition_registration_v2 reanuda en vez de PLU08 inmediato', () => {
    const start = migration.indexOf('function public.create_competition_registration_v2')
    const body = migration.slice(start, migration.indexOf('function public.create_membership_registration_combo_order_core'))
    expect(body).toContain('resume_pending_event_registration_checkout')
    expect(body).not.toMatch(
      /select \* into v_registration from public\.event_registrations\s+where event_id = v_event\.id and athlete_id = p_athlete_id and status <> 'cancelada';\s+if found then\s+raise exception 'Ya estas inscripto/,
    )
  })

  it('el combo reanuda la orden impaga y sigue levantando PLU08 si ya está admitida', () => {
    const start = migration.indexOf('function public.create_membership_registration_combo_order_core')
    const body = migration.slice(start)
    expect(body).toContain('resume_pending_event_registration_checkout')
    expect(migration).toContain("errcode = 'PLU08'")
    expect(migration).toContain('Ya estas inscripto en este evento.')
  })
})
