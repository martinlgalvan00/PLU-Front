import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261225100000_ticket_approve_without_proof_override.sql',
  'utf8',
)

describe('migración: aprobar entrada sin comprobante con motivo', () => {
  it('reemplaza la firma de dos argumentos para no dejar dos funciones', () => {
    expect(migration).toContain('drop function if exists public.staff_approve_ticket_order(uuid, text);')
    expect(migration).toContain('p_override_reason text default null')
    expect(migration).toContain(
      'grant execute on function public.staff_approve_ticket_order(uuid, text, text) to service_role;',
    )
  })

  it('transferencia sin archivo exige motivo de al menos 8 caracteres y lo audita', () => {
    expect(migration).toContain('char_length(v_override) < 8')
    expect(migration).toContain("'overrideWithoutProof', v_override_without_proof")
    expect(migration).toContain("'overrideReason', case when v_override_without_proof then v_override else null end")
  })

  it('Mercado Pago sigue fuera de la aprobación manual', () => {
    expect(migration).toContain("if v_order.provider <> 'manual' then")
    expect(migration).toContain('Mercado Pago solo se acredita por webhook.')
  })
})
