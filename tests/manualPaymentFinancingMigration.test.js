import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909100000_financed_manual_confirmation.sql'),
  'utf8',
)

describe('declaracion manual financiada', () => {
  it('fotografia el permiso desde un combo restringido y manual', () => {
    expect(migration).toContain('financing_allowed boolean not null default false')
    expect(migration).toContain("o.financed and o.audience = 'code'")
    expect(migration).toContain("in ('bank_transfer', 'cash_pitbull')")
    expect(migration).toContain('financing_allowed = financing_allowed or v_financing_allowed')
  })

  it('registra el aviso sin acreditar la orden', () => {
    const start = migration.indexOf(
      'create or replace function public.athlete_confirm_manual_payment',
    )
    const end = migration.indexOf(
      'revoke all on function public.athlete_confirm_manual_payment',
      start,
    )
    const confirmation = migration.slice(start, end)

    expect(confirmation).toContain("status = 'validacion_manual'")
    expect(confirmation).toContain('manual_payment_declared_at = now()')
    expect(confirmation).toContain('expires_at = null')
    expect(confirmation).not.toContain("status = 'aprobado'")
    expect(confirmation).not.toContain('insert into public.athlete_payments')
  })

  it('habilita ambos derechos solo cuando la orden lo permite', () => {
    expect(migration).toContain('if v_order.financing_allowed then')
    expect(migration).toContain("set status = 'activa', updated_at = now()")
    expect(migration).toContain("set status = 'confirmada', updated_at = now()")
    expect(migration).toContain("'payment.manual_declared_by_athlete'")
  })

  it('revoca la habilitacion provisional al rechazar y conserva permisos cerrados', () => {
    expect(migration).toContain('financed_entitlements_revoked_at')
    expect(migration).toContain("and status in ('pendiente_pago', 'confirmada')")
    expect(migration).toContain(
      'revoke all on function public.athlete_confirm_manual_payment(uuid, uuid)',
    )
    expect(migration).toContain('to service_role;')
  })
})
