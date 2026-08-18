import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260818100000_embedded_attempt_terminal_status_guard.sql',
  ),
  'utf8',
)

describe('claim_embedded_payment_attempt bloquea estados terminales', () => {
  it('agrega la guarda de cancelado/reembolsado sin tocar el resto del contrato', () => {
    expect(migration).toContain('create or replace function public.claim_embedded_payment_attempt(')
    expect(migration).toContain("if v_status = 'aprobado' then")
    expect(migration).toContain("if v_status in ('cancelado', 'reembolsado') then")
    expect(migration).toContain(
      "raise exception 'La orden ya no admite un nuevo intento de pago.' using errcode = 'PLU09';",
    )
    // 'rechazado' queda afuera a proposito: es el camino normal de reintento.
    expect(migration).not.toMatch(/'rechazado'.*'cancelado'|'cancelado'.*'rechazado'/)
    expect(migration).toContain(
      'grant execute on function public.claim_embedded_payment_attempt(text, uuid, text, text)\n  to service_role;',
    )
  })
})
