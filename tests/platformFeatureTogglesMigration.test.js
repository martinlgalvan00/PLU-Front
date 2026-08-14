import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819180000_platform_feature_toggles.sql'),
  'utf8',
)

describe('interruptores generales de cobro, afiliación e inscripción', () => {
  it('crea la tabla con valores abiertos por defecto', () => {
    expect(migration).toContain('checkout_enabled boolean not null default true')
    expect(migration).toContain('membership_enabled boolean not null default true')
    expect(migration).toContain('registration_enabled boolean not null default true')
  })

  it('bloquea el acceso directo: solo service_role puede leer o escribir', () => {
    expect(migration).toContain(
      'revoke all on public.platform_feature_toggles from public, anon, authenticated',
    )
    expect(migration).toContain('grant select, insert, update on public.platform_feature_toggles to service_role')
    expect(migration).toContain(
      'revoke all on function public.staff_get_platform_feature_toggles() from public, anon, authenticated',
    )
    expect(migration).toContain(
      'revoke all on function public.staff_set_platform_feature_toggle(text, boolean, text) from public, anon, authenticated',
    )
  })

  it('valida la funcionalidad antes de tocar la fila', () => {
    expect(migration).toContain("if v_feature not in ('checkout', 'membership', 'registration') then")
    expect(migration).toContain('if p_enabled is null then')
  })

  it('audita cada cambio con el valor anterior', () => {
    expect(migration).toContain("'platform_feature_toggle.updated', 'platform_feature_toggle', v_feature")
    expect(migration).toContain("jsonb_build_object('feature', v_feature, 'enabled', p_enabled, 'previousEnabled', v_previous)")
  })
})
