import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260825110000_promo_code_payment_channels.sql'),
  'utf8',
)

describe('medios de pago habilitados por código', () => {
  it('reemplaza el booleano por la lista de canales manuales', () => {
    expect(migration).toContain("add column if not exists manual_channels text[] not null default '{}'")
    expect(migration).toContain(
      "check (manual_channels <@ array['bank_transfer', 'cash_pitbull']::text[])",
    )
  })

  it('conserva enables_manual_payment como columna derivada', () => {
    // Sin esto habría dos fuentes de verdad que se pueden desincronizar, y una
    // API desplegada antes que la migración rompería al leer la columna.
    expect(migration).toContain(
      'generated always as (cardinality(manual_channels) > 0) stored',
    )
    expect(migration).toContain("and is_generated = 'NEVER'")
  })

  it('migra los códigos existentes conservando su significado', () => {
    expect(migration).toContain(
      "set manual_channels = array['bank_transfer', 'cash_pitbull']::text[]",
    )
    expect(migration).toContain('where enables_manual_payment = true')
  })

  it('sigue aceptando el payload anterior de la API', () => {
    expect(migration).toContain("elsif coalesce((p_code ->> 'enablesManualPayment')::boolean, false)")
  })

  it('expone los canales al panel y al checkout', () => {
    expect(migration).toContain("'manualChannels', to_jsonb(c.manual_channels)")
    expect(migration).toContain("'manualChannels', to_jsonb(v_code.manual_channels)")
  })

  it('rechaza canales fuera del conjunto conocido', () => {
    expect(migration).toContain('Los medios de pago del código son inválidos.')
  })
})
