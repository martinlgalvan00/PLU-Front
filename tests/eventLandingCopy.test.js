import { describe, expect, it } from 'vitest'
import {
  convertLandingToBuilder,
  copyLandingFrom,
  landingCopySources,
} from '../src/lib/eventLandingCopy.js'

const sourceEvent = {
  id: 'evt-2025',
  slug: 'copa-norte-2025',
  title: 'Copa Norte 2025',
  startsAt: '2025-11-08T12:00:00Z',
  landing: {
    templateId: 'builder',
    themeId: 'ember',
    publicVisible: true,
    phase: 'published',
    slots: {
      heroTitle: 'Copa Norte 2025',
      heroLead: 'El meet del norte',
      ctaLabel: 'Quiero competir',
      experienceTitle: 'Cómo es el día',
      experienceBody: 'Pesaje, tandas y premiación.',
      heroImagePath: 'events/copa-2025/hero.webp',
      metaTitle: 'Copa Norte 2025 · PLU',
    },
    layout: {
      blocks: [
        { id: 'hero', type: 'hero' },
        { id: 'weighIns', type: 'weighIns', visible: false },
        { id: 'sponsor-copy', type: 'text', props: { title: 'Gracias a los sponsors' } },
      ],
      palette: { accent: '#e4002b', action: '#00a86b' },
      motion: 'depth',
    },
  },
}

const target = {
  templateId: 'meet',
  themeId: 'plu-default',
  publicVisible: false,
  phase: 'coming_soon',
  slots: {
    heroTitle: 'Copa Norte 2026',
    heroImagePath: 'events/copa-2026/hero.webp',
    metaTitle: 'Copa Norte 2026 · PLU',
    experienceTitle: 'Texto viejo',
  },
}

describe('copiar la landing de otro evento', () => {
  it('solo el diseño: plantilla, tema, colores, animación y bloques; los textos quedan', () => {
    const copied = copyLandingFrom(target, sourceEvent)
    expect(copied.templateId).toBe('builder')
    expect(copied.themeId).toBe('ember')
    expect(copied.layout.palette).toEqual({ accent: '#e4002b', action: '#00a86b' })
    expect(copied.layout.motion).toBe('depth')
    expect(copied.layout.blocks.map((block) => block.id)).toEqual([
      'hero',
      'weighIns',
      'sponsor-copy',
    ])
    expect(copied.layout.blocks[1].visible).toBe(false)
    expect(copied.layout.blocks[2].props.title).toBe('Gracias a los sponsors')
    expect(copied.slots.experienceTitle).toBe('Texto viejo')
    expect(copied.slots.heroLead).toBe('')
  })

  it('con textos trae las secciones, pero no el título, la foto ni el SEO de este evento', () => {
    const copied = copyLandingFrom(target, sourceEvent, { includeTexts: true })
    expect(copied.slots).toMatchObject({
      heroLead: 'El meet del norte',
      ctaLabel: 'Quiero competir',
      experienceTitle: 'Cómo es el día',
      experienceBody: 'Pesaje, tandas y premiación.',
      heroTitle: 'Copa Norte 2026',
      heroImagePath: 'events/copa-2026/hero.webp',
      metaTitle: 'Copa Norte 2026 · PLU',
    })
  })

  it('no cambia si la página se ve ni su fase', () => {
    const copied = copyLandingFrom(target, sourceEvent, { includeTexts: true })
    expect(copied.publicVisible).toBe(false)
    expect(copied.phase).toBe('coming_soon')
  })

  it('desde una plantilla sin colores propios no arrastra un layout vacío', () => {
    const plain = { ...sourceEvent, landing: { templateId: 'editorial', themeId: 'night-steel' } }
    const copied = copyLandingFrom({ ...target, layout: { palette: { accent: '#111111' } } }, plain)
    expect(copied.templateId).toBe('editorial')
    expect(copied.layout).toBeUndefined()
  })

  it('ofrece los demás eventos con landing, los más recientes primero', () => {
    const events = [
      { id: 'a', title: 'Viejo', startsAt: '2024-05-01T12:00:00Z', landing: {} },
      { id: 'current', title: 'Este', startsAt: '2026-11-01T12:00:00Z', landing: {} },
      { id: 'b', title: 'Reciente', startsAt: '2026-03-01T12:00:00Z', landing: {} },
      { id: 'c', title: 'Sin landing', startsAt: '2026-04-01T12:00:00Z' },
    ]
    expect(landingCopySources(events, 'current').map((event) => event.id)).toEqual(['b', 'a'])
  })
})

describe('pasar a Constructor sin perder nada', () => {
  const editorial = {
    templateId: 'editorial',
    themeId: 'night-steel',
    publicVisible: false,
    phase: 'coming_soon',
    slots: {
      heroTitle: 'Pitbull Classic 2026',
      heroLead: 'El clásico de PLU',
      heroImagePath: 'events/pitbull/hero.webp',
      experienceTitle: 'La experiencia',
      experienceBody: 'Dos días de powerlifting.',
      faq1Question: '¿Hay que estar afiliado?',
      faq1Answer: 'Sí.',
    },
    layout: { palette: { accent: '#e4002b' }, motion: 'depth' },
  }

  it('conserva textos, foto, tema, colores, animación, visibilidad y fase', () => {
    const converted = convertLandingToBuilder(editorial)
    expect(converted.templateId).toBe('builder')
    expect(converted.themeId).toBe('night-steel')
    expect(converted.publicVisible).toBe(false)
    expect(converted.phase).toBe('coming_soon')
    expect(converted.slots).toMatchObject(editorial.slots)
    expect(converted.layout.palette).toEqual({ accent: '#e4002b' })
    expect(converted.layout.motion).toBe('depth')
  })

  it('arma los bloques integrados y oculta las secciones de texto vacías', () => {
    const { layout } = convertLandingToBuilder(editorial)
    const byId = Object.fromEntries(layout.blocks.map((block) => [block.id, block.visible]))
    expect(layout.blocks[0].id).toBe('hero')
    expect(byId.experience).toBe(true)
    expect(byId.faq).toBe(true)
    expect(byId.categories).toBe(false)
    expect(byId.weighIns).toBe(true)
  })

  it('una landing que ya es Constructor queda igual', () => {
    const builder = { templateId: 'builder', layout: { blocks: [{ id: 'hero', type: 'hero' }] } }
    expect(convertLandingToBuilder(builder).layout.blocks.map((block) => block.id)).toEqual([
      'hero',
    ])
  })
})
