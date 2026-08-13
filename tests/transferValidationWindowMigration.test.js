import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260816130000_transfer_validation_window.sql'),
  'utf8',
)

describe('ventana de validación de transferencias', () => {
  it('mantiene la orden con comprobante disponible durante 48 horas para Administración', () => {
    expect(migration).toContain("status = case when status = 'pendiente' then 'validacion_manual' else status end")
    expect(migration).toContain("now() + interval '48 hours'")
    expect(migration).toContain("'manual_validation_deadline', v_order.expires_at")
  })
})
