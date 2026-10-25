import { describe, expect, it } from 'vitest'
import { copyLandingFrom, landingCopySources } from '../src/lib/eventLandingCopy.js'

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
