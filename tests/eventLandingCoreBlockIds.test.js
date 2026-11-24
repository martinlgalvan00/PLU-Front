import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  defaultLandingBlocks,
  layoutPayloadForMerge,
  normalizeLandingBlocks,
} from '../src/lib/eventLandingLayout.js'
import { buildLandingLayoutSchema } from '../src/lib/schemas/landingLayoutSchema.js'

/**
 * El bloque integrado de pesajes se llama `weighIns`: los integrados usan su
 * tipo como id, y el patrón de ids (minúsculas, números y guiones) lo dejaba
 * afuera. Con eso, la landing del Constructor con su layout por defecto no
 * pasaba la validación del panel, la RPC la rechazaba y al leerla el bloque se
 * perdía en silencio.
 */

const schema = buildLandingLayoutSchema(z)
const migration = readFileSync(
  'supabase/migrations/20261231120000_event_landing_core_block_ids.sql',
  'utf8',
)

describe('ids de los bloques integrados', () => {
  it('el layout por defecto (con pesajes) pasa la validación', () => {
    const blocks = defaultLandingBlocks()
    expect(blocks.map((block) => block.id)).toContain('weighIns')
    expect(schema.safeParse({ blocks }).success).toBe(true)
    expect(schema.safeParse(layoutPayloadForMerge({ blocks })).success).toBe(true)
  })

  it('el bloque de pesajes guardado sobrevive a la normalización', () => {
    const blocks = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'weighIns', type: 'weighIns', visible: false },
    ])
    expect(blocks).toEqual([
      { id: 'hero', type: 'hero', visible: true },
      { id: 'weighIns', type: 'weighIns', visible: false },
    ])
  })

  it('un integrado con otro id y un propio con mayúsculas siguen rechazados', () => {
    expect(schema.safeParse({ blocks: [{ id: 'pesajes', type: 'weighIns' }] }).success).toBe(false)
    expect(
      schema.safeParse({ blocks: [{ id: 'Mi-Bloque', type: 'text', props: { title: 'Hola' } }] })
        .success,
    ).toBe(false)
  })

  it('la RPC aplica el patrón solo a los bloques propios y mantiene id = tipo', () => {
    expect(migration).toContain(
      "or (not (v_type = any (v_core)) and v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$') then",
    )
    expect(migration).toMatch(/if v_type = any \(v_core\) and v_id <> v_type then/)
    expect(migration).toContain("'weighIns'")
    // Sigue aceptando el preset Profundidad y los mismos permisos.
    expect(migration).toContain("'depth'")
    expect(migration).toMatch(/revoke all on function public\.staff_merge_event_landing_layout/)
    expect(migration).toMatch(/security definer\s+set search_path = public/)
  })
})
