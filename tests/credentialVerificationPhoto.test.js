import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Foto en la proyección pública de credencial (20260810120000).
 * Solo por token — mismo criterio de PII que documento y nacimiento.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260810120000_credential_verification_photo.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('migración 20260810120000 — foto en verificación QR', () => {
  const lookup = functionBody(
    migration,
    'create or replace function plu_private.get_membership_by_code_or_token(',
  )

  it('expone photo_path junto al resto de la identidad por token', () => {
    expect(lookup).toContain("'photo_path', v_athlete.photo_path")
    expect(lookup).toContain("'document_id', v_athlete.document_id")
    expect(lookup).toContain("'birth_date', v_athlete.birth_date")
  })

  it('solo agrega la foto cuando la resolución fue por token', () => {
    expect(lookup).toContain('v_by_token boolean := false')
    expect(lookup).toContain('if v_by_token then')

    const byCodeBranch = lookup.slice(
      lookup.indexOf('where m.member_code = p_code'),
      lookup.indexOf('if v_athlete.id is null'),
    )
    expect(byCodeBranch).not.toContain('v_by_token := true')
    expect(byCodeBranch).not.toContain('photo_path')
  })

  it('sigue exponiendo requires_membership en la inscripción del evento', () => {
    expect(lookup).toContain("'requires_membership', coalesce(v_event.requires_membership, true)")
  })
})
