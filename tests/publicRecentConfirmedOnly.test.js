import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261013100000_public_recent_confirmed_only.sql',
  ),
  'utf8',
)

describe('padrón público: solo inscriptos confirmados', () => {
  it('el cupo sigue contando pendiente_pago', () => {
    expect(migration).toMatch(
      /into v_registered[\s\S]*?and r\.status in \('pendiente_pago', 'pagada', 'confirmada'\);/,
    )
  })

  it('recent y registeredToday excluyen pendiente_pago', () => {
    expect(migration).toMatch(
      /into v_registered_today[\s\S]*?and r\.status in \('pagada', 'confirmada'\)/,
    )
    expect(migration).toMatch(
      /and r\.public_visible\s+and r\.status in \('pagada', 'confirmada'\)/,
    )
    expect(migration).not.toMatch(
      /and r\.public_visible\s+and r\.status in \('pendiente_pago', 'pagada', 'confirmada'\)/,
    )
  })
})
