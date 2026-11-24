import { describe, expect, it } from 'vitest'
import {
  patchDraftLanding,
  patchDraftLandingBlocks,
  patchDraftPublicCopy,
} from '../src/components/admin/event-editor/draftPatches.js'
import { normalizeEventLanding } from '../src/lib/eventLanding.js'

const draft = (extra = {}) => ({
  slug: 'winter-open-2026',
  publicCopy: {},
  publicSurface: {},
  landing: normalizeEventLanding({ templateId: 'builder', slots: {} }),
  ...extra,
})

describe('patchDraftPublicCopy', () => {
  it('actualiza publicCopy y refleja el hero en los slots de la landing', () => {
    const next = patchDraftPublicCopy(draft(), { publicTitle: 'Título nuevo', heroLead: 'Bajada' })
    expect(next.publicCopy).toMatchObject({ publicTitle: 'Título nuevo', heroLead: 'Bajada' })
    expect(next.landing.slots).toMatchObject({ heroTitle: 'Título nuevo', heroLead: 'Bajada' })
  })

  it('no pisa lo que ya tenía publicCopy', () => {
    const next = patchDraftPublicCopy(draft({ publicCopy: { inscriptionMark: 'Cupos' } }), {
      heroLead: 'Bajada',
    })
    expect(next.publicCopy).toMatchObject({ inscriptionMark: 'Cupos', heroLead: 'Bajada' })
  })
})

describe('patchDraftLanding', () => {
  it('proyecta hero y cupo de los slots a publicCopy, que leen la ficha y la inscripción', () => {
    const base = draft()
    const next = patchDraftLanding(base, {
      ...base.landing,
      slots: { ...base.landing.slots, heroTitle: 'Hola mundo', inscriptionNote: 'Nota' },
    })
    expect(next.publicCopy).toMatchObject({ publicTitle: 'Hola mundo', inscriptionNote: 'Nota' })
    expect(next.landing.slots.heroTitle).toBe('Hola mundo')
  })

  it('conserva lo tipeado, espacios incluidos (se recorta recién al guardar)', () => {
    const base = draft()
    const next = patchDraftLanding(base, {
      ...base.landing,
      slots: { ...base.landing.slots, heroLead: 'uno dos ' },
    })
    expect(next.landing.slots.heroLead).toBe('uno dos ')
    expect(next.publicCopy.heroLead).toBe('uno dos ')
  })

  it('cambiar de plantilla no toca el resto del borrador', () => {
    const base = draft({ title: 'Winter Open', published: true })
    const next = patchDraftLanding(base, { ...base.landing, templateId: 'editorial' })
    expect(next.landing.templateId).toBe('editorial')
    expect(next).toMatchObject({ title: 'Winter Open', published: true, slug: 'winter-open-2026' })
  })

  it('no muta el borrador original', () => {
    const base = draft()
    const snapshot = JSON.stringify(base)
    patchDraftLanding(base, { ...base.landing, publicVisible: false })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('patchDraftLandingBlocks', () => {
  const blocks = [
    { id: 'hero', type: 'hero', visible: true },
    { id: 'faq', type: 'faq', visible: false },
  ]

  it('guarda los bloques normalizados en landing.layout', () => {
    const base = draft()
    const next = patchDraftLandingBlocks(base, base.landing, blocks)
    expect(next.landing.layout.blocks.map((block) => block.id)).toEqual(['hero', 'faq'])
    expect(next.landing.layout.blocks[1].visible).toBe(false)
  })

  it('conserva la paleta al cambiar los bloques', () => {
    const base = draft({
      landing: normalizeEventLanding({
        templateId: 'builder',
        layout: { palette: { accent: '#ff8800' } },
      }),
    })
    const next = patchDraftLandingBlocks(base, base.landing, blocks)
    expect(next.landing.layout.palette).toEqual({ accent: '#ff8800' })
  })

  it('con cambio de módulo público actualiza el switch en el mismo parche', () => {
    const base = draft()
    const next = patchDraftLandingBlocks(base, base.landing, blocks, { key: 'faq', visible: false })
    expect(next.publicSurface.faq).toBe(false)
    // Los demás módulos siguen encendidos.
    expect(next.publicSurface.schedule).toBe(true)
  })

  it('sin cambio de módulo no toca publicSurface', () => {
    const base = draft({ publicSurface: { faq: false } })
    const next = patchDraftLandingBlocks(base, base.landing, blocks)
    expect(next.publicSurface).toEqual({ faq: false })
  })
})
