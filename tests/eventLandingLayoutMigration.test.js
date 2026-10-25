import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORE_BLOCK_ORDER,
  CUSTOM_BLOCK_TYPES,
  LANDING_BLOCK_LIMITS,
} from '../src/lib/eventLandingLayout.js'
import { LANDING_MOTION_PRESETS } from '../src/lib/eventLandingMotion.js'

/**
 * La migración no se puede ejecutar en CI sin una base: se ancla acá a las
 * constantes del código para que los topes y tipos no se desalineen.
 */
const stateSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261229100000_event_landing_layout.sql'),
  'utf8',
)
// La RPC del layout se redefinió después (Profundidad, ids integrados, bloques
// nuevos): se ancla la versión vigente.
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261231130000_event_landing_more_blocks.sql'),
  'utf8',
)

describe('migración staff_merge_event_landing_layout', () => {
  it('acepta la plantilla builder en la RPC de estado', () => {
    expect(stateSql).toMatch(/v_template not in \('meet', 'editorial', 'submission', 'builder'\)/)
  })

  /** Lista `array['a', 'b']` de una variable constante de la función SQL. */
  function sqlList(variable) {
    const match = sql.match(new RegExp(`${variable} constant text\\[\\] := array\\[([^\\]]+)\\]`))
    return match ? [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]) : null
  }

  it('los tipos de bloque integrados y propios son exactamente los del código', () => {
    expect(sqlList('v_core')).toEqual(CORE_BLOCK_ORDER)
    expect(sqlList('v_custom')).toEqual(Object.keys(CUSTOM_BLOCK_TYPES))
  })

  it('los topes espejan LANDING_BLOCK_LIMITS', () => {
    for (const key of ['eyebrow', 'title', 'body', 'label', 'href', 'path', 'alt', 'caption', 'video']) {
      expect(sql, key).toContain(`'${key}', ${LANDING_BLOCK_LIMITS[key]}`)
    }
    // Galería y sponsors: una ruta por foto o logo, con el tope de `path`.
    for (let n = 1; n <= LANDING_BLOCK_LIMITS.sponsorLogos; n += 1) {
      expect(sql, `path${n}`).toContain(`'path${n}', ${LANDING_BLOCK_LIMITS.path}`)
    }
    expect(sql).toContain("v_key ~ '^path[1-8]$'")
    expect(sql).toMatch(/v_key = 'video' and v_val !~\* '\^https:\/\/\(\(www/)
    expect(sql).toContain(`> ${LANDING_BLOCK_LIMITS.maxBlocks} then`)
  })

  it('valida el preset de animación y lo guarda dentro del layout', () => {
    // La lista vigente la amplió 20261231100000 (Profundidad): esta conserva
    // los presets originales, todos todavía válidos.
    expect(LANDING_MOTION_PRESETS).toEqual(expect.arrayContaining(sqlList('v_motions')))
    expect(sql).toContain("'motion', v_motion")
    expect(sql).toMatch(/not \(v_motion = any \(v_motions\)\)/)
  })

  it('valida id, link, ruta y color, y solo el service role la ejecuta', () => {
    expect(sql).toContain('^[a-z0-9][a-z0-9-]{0,39}$')
    expect(sql).toContain('^#[0-9a-fA-F]{6}$')
    expect(sql).toContain('^[A-Za-z0-9._()+/-]+$')
    expect(sql).toMatch(/https:\/\//)
    expect(sql).toMatch(
      /revoke all on function public\.staff_merge_event_landing_layout\(text, jsonb\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_merge_event_landing_layout\(text, jsonb\)\s+to service_role/,
    )
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('conserva el resto de rules.landing al escribir el layout', () => {
    expect(sql).toMatch(/v_landing \|\| jsonb_build_object\(\s*'layout'/)
  })
})
