import { describe, expect, it } from 'vitest'
import {
  isPublicCatalogEvent,
  underConstructionCatalogEvent,
} from '../server/services/publicEventCatalogService.js'

describe('isPublicCatalogEvent', () => {
  it('no expone Submission cuando su landing esta apagada', () => {
    expect(
      isPublicCatalogEvent({
        rules: { landing: { templateId: 'submission', publicVisible: false } },
      }),
    ).toBe(false)
  })

  it('conserva visibles los eventos existentes y Submission encendida', () => {
    expect(isPublicCatalogEvent({ rules: {} })).toBe(true)
    expect(
      isPublicCatalogEvent({
        rules: { landing: { templateId: 'submission', publicVisible: true } },
      }),
    ).toBe(true)
  })
})

describe('landing apagada (cualquier plantilla)', () => {
  it('deja de ser catalogo publico sin importar la plantilla', () => {
    for (const templateId of ['meet', 'editorial', 'submission', 'builder']) {
      expect(
        isPublicCatalogEvent({ rules: { landing: { templateId, publicVisible: false } } }),
      ).toBe(false)
    }
  })

  it('el stub "en construccion" no filtra ningun dato del evento', () => {
    const stub = underConstructionCatalogEvent({
      id: 'evt-1',
      slug: 'barbell-submission-2027',
      title: 'Barbell Submission',
      description: 'Descripcion privada',
      venue: 'Virtus Fitness',
      location: 'Berazategui',
      starts_at: '2027-03-06T12:00:00Z',
      price: 75000,
      capacity: 180,
      comboOffer: { price: 1 },
      ticketTypes: [{ id: 't1' }],
      rules: {
        comboPrice: 99,
        landing: {
          templateId: 'submission',
          themeId: 'ember',
          publicVisible: false,
          slots: { heroTitle: 'Titulo', experienceBody: 'Texto interno' },
        },
      },
    })

    expect(stub).toEqual({
      id: 'evt-1',
      slug: 'barbell-submission-2027',
      title: 'Barbell Submission',
      published: true,
      status: 'proximamente',
      rules: {
        landing: { templateId: 'submission', themeId: 'ember', publicVisible: false },
      },
    })
    const text = JSON.stringify(stub)
    for (const secret of ['Virtus', 'Berazategui', '75000', 'Descripcion privada', 'Texto interno']) {
      expect(text).not.toContain(secret)
    }
  })

  it('conserva la paleta propia para que la pagina en construccion use los colores del evento', () => {
    const stub = underConstructionCatalogEvent({
      slug: 'x',
      rules: { landing: { publicVisible: false, layout: { palette: { accent: '#ff8800' }, blocks: [{ id: 'a' }] } } },
    })
    expect(stub.rules.landing.layout).toEqual({ palette: { accent: '#ff8800' } })
  })

  it('conserva la animación elegida para la escena de la página en construcción', () => {
    const stub = underConstructionCatalogEvent({
      slug: 'x',
      rules: { landing: { publicVisible: false, layout: { motion: 'none', blocks: [{ id: 'a' }] } } },
    })
    expect(stub.rules.landing.layout).toEqual({ motion: 'none' })
  })
})
