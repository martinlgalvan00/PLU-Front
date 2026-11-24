import { describe, expect, it } from 'vitest'
import { hiddenLandingTakesRegistrations } from '../shared/registrationSaleState.js'
import {
  publicCatalogEventFor,
  registrationOnlyCatalogEvent,
} from '../server/services/publicEventCatalogService.js'
import { findRegistrableEvent } from '../src/lib/eventNavigation.js'
import { mapSupabaseEventRow } from '../src/services/eventAdminService.js'
import { validateCompetitionForm } from '../src/lib/validation.js'

const NOW = new Date('2026-10-24T12:00:00Z')

/** Fila cruda como la lee el catálogo (`readPublishedCatalog`). */
function hiddenRow(overrides = {}) {
  const { rules = {}, ...rest } = overrides
  return {
    id: 'evt-bs',
    slug: 'barbell-submission-2027',
    title: 'Barbell Submission',
    description: 'Powerlifting en Berazategui',
    venue: 'Virtus Fitness',
    location: 'Berazategui',
    starts_at: '2027-03-06T12:00:00Z',
    ends_at: '2027-03-06T22:00:00Z',
    registration_opens_at: null,
    registration_closes_at: null,
    status: 'inscripcion_abierta',
    published: true,
    price: 75000,
    hero_image_url: 'https://cdn.example/hero-borrador.webp',
    ...rest,
    rules: {
      offering: { categories: ['Raw'], divisions: ['Open', 'Junior'], modalities: ['full_power'] },
      publicCopy: { publicTitle: 'Copy en borrador' },
      landing: {
        templateId: 'submission',
        themeId: 'ember',
        publicVisible: false,
        slots: { heroTitle: 'Titulo interno', experienceBody: 'Texto interno' },
        layout: { palette: { accent: '#ff8800' }, blocks: [{ id: 'b1' }] },
      },
      ...rules,
    },
  }
}

describe('hiddenLandingTakesRegistrations', () => {
  it('con la venta abierta, la landing oculta igual inscribe (fila cruda o evento mapeado)', () => {
    expect(hiddenLandingTakesRegistrations(hiddenRow(), { now: NOW })).toBe(true)
    expect(
      hiddenLandingTakesRegistrations(
        {
          status: 'inscripcion_abierta',
          published: true,
          registrationOpensAt: null,
          salesIntent: 'charge',
        },
        { now: NOW },
      ),
    ).toBe(true)
  })

  it('programada (abre sola) también: el aviso dice cuándo abre', () => {
    expect(
      hiddenLandingTakesRegistrations(
        hiddenRow({ registration_opens_at: '2026-11-01T12:00:00Z' }),
        { now: NOW },
      ),
    ).toBe(true)
  })

  it.each([
    ['cerrada por el staff', { status: 'cerrado' }],
    ['todavía no abierta', { status: 'proximamente' }],
    ['agotada', { status: 'agotado' }],
    ['finalizada', { status: 'finalizado' }],
    ['ventana vencida', { registration_closes_at: '2026-10-01T00:00:00Z' }],
    ['despublicada', { published: false }],
    ['solo anuncio', { rules: { salesIntent: 'announce' } }],
    [
      'programada pero solo anuncio',
      { registration_opens_at: '2026-11-01T12:00:00Z', rules: { salesIntent: 'announce' } },
    ],
  ])('no inscribe si está %s', (_label, overrides) => {
    expect(hiddenLandingTakesRegistrations(hiddenRow(overrides), { now: NOW })).toBe(false)
  })

  it('usa el estado guardado aunque el público vea otro', () => {
    expect(
      hiddenLandingTakesRegistrations(
        { status: 'proximamente', storedStatus: 'inscripcion_abierta', published: true },
        { now: NOW },
      ),
    ).toBe(true)
  })
})

describe('catálogo público con la landing oculta', () => {
  it('venta abierta: viaja lo del checkout, no la página en armado', () => {
    const event = publicCatalogEventFor(hiddenRow(), NOW)

    expect(event).toMatchObject({
      slug: 'barbell-submission-2027',
      status: 'inscripcion_abierta',
      venue: 'Virtus Fitness',
      location: 'Berazategui',
      starts_at: '2027-03-06T12:00:00Z',
      price: 75000,
    })
    expect(event.rules.offering).toEqual(hiddenRow().rules.offering)
    expect(event.rules.landing).toEqual({
      templateId: 'submission',
      themeId: 'ember',
      publicVisible: false,
      layout: { palette: { accent: '#ff8800' } },
    })
    expect(event.rules.publicCopy).toBeUndefined()
    expect(event.hero_image_url).toBeUndefined()
    const text = JSON.stringify(event)
    for (const draft of ['Titulo interno', 'Texto interno', 'Copy en borrador', 'hero-borrador']) {
      expect(text).not.toContain(draft)
    }
  })

  it('venta cerrada: sigue siendo solo el aviso, sin datos del evento', () => {
    const event = publicCatalogEventFor(hiddenRow({ status: 'cerrado' }), NOW)
    expect(Object.keys(event).sort()).toEqual(['id', 'published', 'rules', 'slug', 'status', 'title'])
    expect(JSON.stringify(event)).not.toContain('Virtus')
  })

  it('landing visible: catálogo completo, como siempre', () => {
    const row = hiddenRow({ rules: { landing: { templateId: 'submission', publicVisible: true } } })
    const event = publicCatalogEventFor(row, NOW)
    expect(event.rules.landing.publicVisible).toBe(true)
    expect(event.rules.publicCopy).toEqual({ publicTitle: 'Copy en borrador' })
  })

  it('el evento mapeado se sigue reconociendo como "en construcción" y conserva la oferta', () => {
    const mapped = mapSupabaseEventRow(registrationOnlyCatalogEvent(hiddenRow(), NOW))
    expect(mapped.landing.publicVisible).toBe(false)
    expect(mapped.landing.templateId).toBe('submission')
    expect(mapped.offering.categories).toEqual(['Raw'])
    expect(mapped.price).toBe(75000)
    expect(mapped.heroImageUrl).toBeNull()
  })
})

describe('findRegistrableEvent', () => {
  const catalog = [{ slug: 'winter-open-2026', status: 'inscripcion_abierta', published: true }]
  const selling = {
    slug: 'barbell-submission-2027',
    status: 'inscripcion_abierta',
    published: true,
    landing: { publicVisible: false },
  }

  it('encuentra el evento del catálogo o la landing en construcción que vende', () => {
    expect(findRegistrableEvent('winter-open-2026', catalog, [selling])).toBe(catalog[0])
    expect(findRegistrableEvent('barbell-submission-2027', catalog, [selling])).toBe(selling)
  })

  it('no ofrece una landing en construcción con la venta cerrada ni inventa eventos', () => {
    const closed = { ...selling, status: 'cerrado' }
    expect(findRegistrableEvent('barbell-submission-2027', catalog, [closed])).toBeNull()
    expect(findRegistrableEvent('otro', catalog, [selling])).toBeNull()
    expect(findRegistrableEvent(null, catalog, [selling])).toBeNull()
  })
})

describe('validación del formulario contra lo que ofrece el evento', () => {
  const offering = { categories: ['Raw'], divisions: ['Open', 'Junior'], modalities: ['full_power'] }
  const form = {
    division: 'Open',
    category: 'Raw',
    declaredWeightClass: '90',
    estimatedWeight: '89',
    competitionBestTotalKg: '500',
    paymentMethod: 'mercado_pago',
    modalities: ['full_power'],
  }
  const context = { sex: 'Masculino', offering }

  it('una selección dentro de la oferta pasa', () => {
    expect(validateCompetitionForm(form, null, context).success).toBe(true)
  })

  it.each([
    ['category', { category: 'Single-Ply' }],
    ['division', { division: 'Masters' }],
    ['modalities', { modalities: ['bench'] }],
  ])('frena %s fuera de la oferta antes de pedir el cobro', (field, patch) => {
    const result = validateCompetitionForm({ ...form, ...patch }, null, context)
    expect(result.success).toBe(false)
    expect(result.errors[field]).toMatch(/no ofrece/i)
  })

  it('sin modalidad elegida no pasa', () => {
    const result = validateCompetitionForm({ ...form, modalities: [] }, null, context)
    expect(result.success).toBe(false)
    expect(result.errors.modalities).toBeTruthy()
  })

  it('sin oferta conocida no se inventa un bloqueo', () => {
    expect(
      validateCompetitionForm({ ...form, category: 'Single-Ply' }, null, { sex: 'Masculino' })
        .success,
    ).toBe(true)
  })
})

describe('sortEventsForCalendar', () => {
  it('ordena lo que viene por fecha aunque llegue desordenado, y lo terminado al revés', async () => {
    const { sortEventsForCalendar } = await import('../src/lib/eventNavigation.js')
    const events = [
      { slug: 'marzo', startsAt: '2027-03-06T12:00:00Z' },
      { slug: 'sin-fecha' },
      { slug: 'diciembre', startsAt: '2026-12-12T12:00:00Z' },
    ]
    expect(sortEventsForCalendar(events).map((e) => e.slug)).toEqual([
      'diciembre',
      'marzo',
      'sin-fecha',
    ])
    expect(sortEventsForCalendar(events, { finished: true }).map((e) => e.slug)).toEqual([
      'marzo',
      'diciembre',
      'sin-fecha',
    ])
    // No muta la lista original.
    expect(events[0].slug).toBe('marzo')
  })
})
