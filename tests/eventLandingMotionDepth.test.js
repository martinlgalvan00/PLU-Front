import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LANDING_MOTION_PRESETS,
  hasCustomLandingMotion,
  normalizeLandingMotion,
} from '../src/lib/eventLandingMotion.js'
import { buildLandingLayoutSchema } from '../src/lib/schemas/landingLayoutSchema.js'
import { landingPayloadForMerge, normalizeEventLanding } from '../src/lib/eventLanding.js'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('preset "Profundidad" (depth)', () => {
  it('es un preset válido que se conserva al normalizar y guardar', () => {
    expect(LANDING_MOTION_PRESETS).toContain('depth')
    expect(normalizeLandingMotion('depth')).toBe('depth')
    expect(hasCustomLandingMotion('depth')).toBe(true)

    const landing = normalizeEventLanding({ templateId: 'submission', layout: { motion: 'depth' } })
    expect(landing.layout.motion).toBe('depth')
    expect(landingPayloadForMerge(landing).layout.motion).toBe('depth')
  })

  it('el esquema del layout lo acepta y sigue rechazando valores inventados', () => {
    const schema = buildLandingLayoutSchema(z)
    expect(schema.safeParse({ blocks: [], motion: 'depth' }).success).toBe(true)
    expect(schema.safeParse({ blocks: [], motion: 'warp' }).success).toBe(false)
  })

  it('la migración nueva acepta exactamente los presets del código', () => {
    const sql = read('supabase/migrations/20261231100000_event_landing_motion_depth.sql')
    const match = sql.match(/v_motions constant text\[\] := array\[([^\]]+)\]/)
    expect([...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])).toEqual(
      LANDING_MOTION_PRESETS,
    )
    expect(sql).toContain('create or replace function public.staff_merge_event_landing_layout(')
    expect(sql).toMatch(
      /revoke all on function public\.staff_merge_event_landing_layout\(text, jsonb\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_merge_event_landing_layout\(text, jsonb\)\s+to service_role/,
    )
    expect(sql).toContain('security definer')
  })

  it('el CSS solo anima transform/opacity, respeta reduced-motion y la gama baja', () => {
    const css = read('src/styles/pages/event-landing-motion.css')
    expect(css).not.toMatch(/transition:\s*all/)
    expect(css).toMatch(/rotateX\(6deg\)/)
    expect(css).not.toMatch(/rotateX\((?:[7-9]|\d{2,})deg\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)/)
    expect(css).toMatch(/\[data-motion-tier='low'\] \.event-landing-theme\[data-motion='depth'\]/)
  })
})
