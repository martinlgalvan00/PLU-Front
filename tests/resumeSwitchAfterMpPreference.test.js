import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El brick embebido puede crear una preference. Eso no es un pago:
 * el atleta tiene que poder pasar a transferencia si todavía no hay
 * intento embedded en curso ni comprobante.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260817120000_resume_switch_after_mp_preference.sql',
  ),
  'utf8',
)

describe('migración 20260817120000 — cambiar medio después de abrir MP', () => {
  it('permite el switch sin exigir preference nula y limpia la preference vieja', () => {
    expect(migration).toContain('function public.resume_pending_event_registration_checkout')
    expect(migration).toContain('v_can_switch')
    expect(migration).not.toContain('provider_preference_id is null')
    expect(migration).toContain('provider_preference_id = null')
    expect(migration).toContain("a.status in ('processing', 'submitted')")
    expect(migration).toContain('payment_proof_path is null')
  })
})
