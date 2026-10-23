import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANDING_MOTION,
  hasCustomLandingMotion,
  isLandingMotion,
  LANDING_MOTION_PRESETS,
  normalizeLandingMotion,
} from '../src/lib/eventLandingMotion.js'
import {
  layoutPayloadForMerge,
  normalizeLandingLayout,
} from '../src/lib/eventLandingLayout.js'
import { normalizeEventLanding } from '../src/lib/eventLanding.js'
import { buildLandingLayoutSchema } from '../src/lib/schemas/landingLayoutSchema.js'
import { z } from 'zod'

describe('animaciones de la landing', () => {
  it('acepta solo los tres presets y cae al suave ante cualquier otra cosa', () => {
    expect(LANDING_MOTION_PRESETS).toEqual(['none', 'soft', 'bold'])
    expect(normalizeLandingMotion('bold')).toBe('bold')
    expect(normalizeLandingMotion(' none ')).toBe('none')
    for (const raw of [undefined, null, '', 'wild', 3, {}]) {
      expect(normalizeLandingMotion(raw)).toBe(DEFAULT_LANDING_MOTION)
    }
    expect(isLandingMotion('soft')).toBe(true)
    expect(isLandingMotion('Soft')).toBe(false)
  })

  it('distingue una elección explícita del valor por defecto', () => {
    expect(hasCustomLandingMotion('bold')).toBe(true)
    expect(hasCustomLandingMotion('none')).toBe(true)
    expect(hasCustomLandingMotion('soft')).toBe(false)
    expect(hasCustomLandingMotion('zzz')).toBe(false)
  })

  it('el layout siempre lleva motion y el payload de guardado también', () => {
    expect(normalizeLandingLayout({ motion: 'bold' }).motion).toBe('bold')
    expect(normalizeLandingLayout(null).motion).toBe('soft')
    expect(layoutPayloadForMerge({ motion: 'none' }).motion).toBe('none')
    expect(layoutPayloadForMerge({ motion: 'none' }, { templateId: 'meet' }).motion).toBe('none')
  })

  it('fuera del Constructor el layout solo viaja con colores o con animación elegida', () => {
    const plain = normalizeEventLanding({ templateId: 'meet' })
    expect(plain.layout).toBeUndefined()
    expect(normalizeEventLanding({ templateId: 'meet', layout: { motion: 'soft' } }).layout).toBeUndefined()
    expect(normalizeEventLanding({ templateId: 'meet', layout: { motion: 'bold' } }).layout).toEqual({
      blocks: [],
      palette: {},
      motion: 'bold',
    })
  })

  it('el esquema compartido rechaza un preset desconocido', () => {
    const schema = buildLandingLayoutSchema(z)
    expect(schema.safeParse({ blocks: [], motion: 'bold' }).success).toBe(true)
    expect(schema.safeParse({ blocks: [], motion: 'wild' }).success).toBe(false)
    expect(schema.safeParse({ blocks: [] }).success).toBe(true)
  })
})
