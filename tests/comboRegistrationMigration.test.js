import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260812120000_combo_membership_registration_transaction.sql',
  'utf8',
)
const paymentApplication = readFileSync(
  'supabase/migrations/20260802120000_membership_audit_credential_hardening.sql',
  'utf8',
)
const hardening = readFileSync(
  'supabase/migrations/20260812150000_combo_transaction_hardening.sql',
  'utf8',
)

describe('transaccion de combo afiliacion + inscripcion', () => {
  it('toma precio, moneda y plan del catalogo bloqueado en base', () => {
    expect(migration).toContain(
      'create or replace function public.create_membership_registration_combo_order(',
    )
    expect(migration).toMatch(/from public\.events[\s\S]*for update/)
    expect(migration).toMatch(/from public\.event_combo_offers[\s\S]*for update/)
    expect(migration).toMatch(/from public\.membership_plans[\s\S]*for update/)
    expect(migration).toContain("v_plan.collection_mode <> 'one_time'")
    expect(migration).toContain('v_offer.price > v_plan.price + v_event.price')
  })

  it('crea una sola orden y vincula ambos derechos al mismo payment_order_id', () => {
    expect(migration).toMatch(
      /insert into public\.athlete_payment_orders[\s\S]*'combo', v_offer\.price/,
    )
    expect(migration).toMatch(
      /insert into public\.membership_order_targets[\s\S]*v_order\.id, v_membership\.id/,
    )
    expect(migration).toMatch(
      /insert into public\.event_registrations[\s\S]*'pendiente_pago', v_order\.id/,
    )
    expect(migration).toContain("'combo_order.created'")
  })

  it('es idempotente y solo service_role puede ejecutarla', () => {
    expect(migration).toContain('where idempotency_key = p_idempotency_key')
    expect(migration).toContain("'duplicate', true")
    expect(migration).toMatch(
      /revoke all on function public\.create_membership_registration_combo_order\([\s\S]*from public, anon, authenticated/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.create_membership_registration_combo_order\([\s\S]*to service_role/,
    )
    expect(migration).toContain('v_registration.bodyweight_kg is distinct from p_bodyweight_kg')
  })

  it('no duplica una afiliacion vigente ni reemplaza un pago con evidencia', () => {
    expect(hardening).toContain('o.payment_proof_path is not null')
    expect(hardening).toContain("m.status = 'activa'")
    expect(hardening).toContain('El atleta ya tiene una afiliacion vigente o programada.')
  })

  it('recupera la idempotencia antes de releer la vigencia de la oferta', () => {
    expect(hardening).toContain('where idempotency_key = p_idempotency_key')
    expect(hardening).toContain("'duplicate', true")
    expect(hardening.indexOf('where idempotency_key = p_idempotency_key')).toBeLessThan(
      hardening.indexOf("m.status = 'activa'"),
    )
    expect(hardening).toContain('create_membership_registration_combo_order_core')
  })

  it('la acreditacion existente activa o revierte afiliacion e inscripcion juntas', () => {
    expect(paymentApplication).toContain("v_order.concept in ('membership', 'combo')")
    expect(paymentApplication).toContain("v_order.concept in ('registration', 'combo')")
    expect(paymentApplication).toContain("set status = 'activa'")
    expect(paymentApplication).toContain("set status = 'confirmada'")
  })
})
