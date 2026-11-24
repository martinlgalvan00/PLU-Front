import { describe, expect, it } from 'vitest'
import {
  EVENT_LANDING_SECTIONS,
  isLandingSectionVisible,
  landingSectionContent,
  landingSectionsForEvent,
} from '../src/lib/eventLandingSections.js'
import {
  EVENT_PUBLIC_SURFACE_MODULES,
  normalizeEventPublicSurface,
} from '../src/lib/eventPublicSurface.js'
import { normalizeEventLanding } from '../src/lib/eventLanding.js'

const ids = (sections) => sections.map((section) => section.id)

describe('secciones de la landing', () => {
  it('cubre cada módulo apagable de publicSurface exactamente una vez', () => {
    const covered = EVENT_LANDING_SECTIONS.map((section) => section.surfaceKey).filter(Boolean)
    expect(covered.sort()).toEqual(EVENT_PUBLIC_SURFACE_MODULES.map((module) => module.key).sort())
  })

  it('respeta el alcance de cada módulo definido en publicSurface', () => {
    for (const section of EVENT_LANDING_SECTIONS) {
      if (!section.surfaceKey) continue
      const module = EVENT_PUBLIC_SURFACE_MODULES.find((item) => item.key === section.surfaceKey)
      expect(section.scope, section.id).toBe(module.scope)
    }
  })

  it('la ficha meet no ofrece secciones de landing propia', () => {
    const sections = landingSectionsForEvent({ slug: 'otro', landing: { templateId: 'meet' } })
    expect(ids(sections)).toEqual([
      'hero',
      'inscription',
      'weighIns',
      'schedule',
      'recentRegistrants',
      'livestream',
      'calendar',
      'faq',
    ])
  })

  it('editorial y submission suman experiencia, categorías, lugar, entradas y cuenta regresiva', () => {
    for (const templateId of ['editorial', 'submission']) {
      const sections = ids(landingSectionsForEvent({ landing: { templateId } }))
      expect(sections).toEqual(
        expect.arrayContaining(['countdown', 'experience', 'categories', 'location', 'tickets']),
      )
    }
  })

  it('hero e inscripción no tienen interruptor: siempre se muestran', () => {
    const hero = EVENT_LANDING_SECTIONS.find((section) => section.id === 'hero')
    const inscription = EVENT_LANDING_SECTIONS.find((section) => section.id === 'inscription')
    expect(isLandingSectionVisible(hero, { faq: false })).toBe(true)
    expect(isLandingSectionVisible(inscription, { faq: false })).toBe(true)
  })

  it('ausente = visible; false = oculta', () => {
    const faq = EVENT_LANDING_SECTIONS.find((section) => section.id === 'faq')
    expect(isLandingSectionVisible(faq, undefined)).toBe(true)
    expect(isLandingSectionVisible(faq, normalizeEventPublicSurface({ faq: false }))).toBe(false)
  })

  it('cuenta textos propios sin contar espacios', () => {
    const landing = normalizeEventLanding({
      templateId: 'editorial',
      slots: { experienceTitle: 'Jueces', experienceBody: '   ' },
    })
    const experience = EVENT_LANDING_SECTIONS.find((section) => section.id === 'experience')
    expect(landingSectionContent(experience, landing, {})).toEqual({ filled: 1, total: 2 })
  })

  it('el cupo público cuenta desde publicCopy', () => {
    const inscription = EVENT_LANDING_SECTIONS.find((section) => section.id === 'inscription')
    expect(
      landingSectionContent(inscription, normalizeEventLanding(null), {
        inscriptionMark: 'Cupos',
        inscriptionNote: '',
      }),
    ).toEqual({ filled: 1, total: 2 })
  })

  it('la FAQ expone sus seis campos', () => {
    const faq = EVENT_LANDING_SECTIONS.find((section) => section.id === 'faq')
    expect(faq.fields).toHaveLength(6)
  })
})
