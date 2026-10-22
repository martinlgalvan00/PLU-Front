import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  eventHasEditorialLanding,
  eventHasSubmissionLanding,
  eventLandingIsPublic,
  eventLandingFaqItems,
  eventLandingSeo,
  eventLandingTemplateId,
  normalizeEventLanding,
  publicCopyFromLandingSlots,
  syncLandingSlotsFromPublicCopy,
} from '../src/lib/eventLanding.js'
import { eventHasCustomPublicPage } from '../src/lib/eventPublicSurface.js'
import { buildAdminEventDraft, mapDraftToPreviewEvent } from '../src/services/eventAdminService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261219100000_event_landing.sql'),
  'utf8',
)
const faqSeoMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261220100000_event_landing_faq_seo.sql'),
  'utf8',
)
const themeMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261222100000_event_landing_theme.sql'),
  'utf8',
)
const submissionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261226100000_submission_landing.sql'),
  'utf8',
)

describe('landing de evento (plantilla + slots)', () => {
  it('default meet y slots vacíos sin inventar', () => {
    expect(normalizeEventLanding(null)).toEqual({
      templateId: 'meet',
      themeId: 'plu-default',
      publicVisible: true,
      phase: 'coming_soon',
      slots: {
        heroTitle: '',
        heroLead: '',
        ctaLabel: '',
        inscriptionMark: '',
        inscriptionNote: '',
        experienceTitle: '',
        experienceBody: '',
        categoriesTitle: '',
        categoriesBody: '',
        locationTitle: '',
        locationBody: '',
        heroImagePath: '',
        metaTitle: '',
        metaDescription: '',
        faq1Question: '',
        faq1Answer: '',
        faq2Question: '',
        faq2Answer: '',
        faq3Question: '',
        faq3Answer: '',
      },
    })
  })

  it('acepta themeId válido y cae a plu-default si es inválido', () => {
    expect(normalizeEventLanding({ templateId: 'meet', themeId: 'ember' }).themeId).toBe('ember')
    expect(normalizeEventLanding({ themeId: 'nope' }).themeId).toBe('plu-default')
  })

  it('Pitbull sin landing en rules cae a editorial por compat', () => {
    expect(
      eventLandingTemplateId({ slug: 'pitbull-classic-2026', publicCopy: {} }),
    ).toBe('editorial')
    expect(eventHasEditorialLanding({ slug: 'pitbull-classic-2026' })).toBe(true)
    expect(eventHasCustomPublicPage({ slug: 'pitbull-classic-2026' })).toBe(true)
  })

  it('templateId meet gana sobre el slug legacy', () => {
    expect(
      eventLandingTemplateId({
        slug: 'pitbull-classic-2026',
        landing: { templateId: 'meet', slots: {} },
      }),
    ).toBe('meet')
    expect(
      eventHasCustomPublicPage({
        slug: 'pitbull-classic-2026',
        landing: { templateId: 'meet' },
      }),
    ).toBe(false)
  })

  it('Barbell Submission cae a su landing propia y se puede ocultar', () => {
    const event = { slug: 'barbell-submission-2027', publicCopy: {} }
    expect(eventLandingTemplateId(event)).toBe('submission')
    expect(eventHasSubmissionLanding(event)).toBe(true)
    expect(eventLandingIsPublic(event)).toBe(true)
    expect(
      eventLandingIsPublic({
        ...event,
        landing: { templateId: 'submission', publicVisible: false },
      }),
    ).toBe(false)
  })

  it('rellena hero desde publicCopy cuando los slots están vacíos', () => {
    const landing = normalizeEventLanding(
      { templateId: 'editorial', slots: {} },
      {
        publicCopy: {
          publicTitle: 'La Clásica',
          heroLead: 'Fecha nacional',
          ctaLabel: 'Competir',
        },
      },
    )
    expect(landing.slots.heroTitle).toBe('La Clásica')
    expect(landing.slots.heroLead).toBe('Fecha nacional')
    expect(landing.slots.ctaLabel).toBe('Competir')
  })

  it('proyecta slots a publicCopy y sincroniza al revés', () => {
    expect(
      publicCopyFromLandingSlots({
        heroTitle: 'Meet',
        heroLead: 'Lead',
        ctaLabel: 'Go',
        inscriptionMark: 'Cupo',
        inscriptionNote: 'Nota',
      }),
    ).toEqual({
      publicTitle: 'Meet',
      heroLead: 'Lead',
      ctaLabel: 'Go',
      inscriptionMark: 'Cupo',
      inscriptionNote: 'Nota',
    })

    const synced = syncLandingSlotsFromPublicCopy(
      { templateId: 'editorial', slots: { experienceTitle: 'Exp' } },
      { publicTitle: 'Nuevo', heroLead: 'Bajada' },
    )
    expect(synced.templateId).toBe('editorial')
    expect(synced.slots.heroTitle).toBe('Nuevo')
    expect(synced.slots.heroLead).toBe('Bajada')
    expect(synced.slots.experienceTitle).toBe('Exp')
  })

  it('viaja en draft y preview del panel', () => {
    const draft = buildAdminEventDraft({
      id: 'e1',
      slug: 'spring-classic-2027',
      title: 'Spring Classic',
      landing: {
        templateId: 'editorial',
        slots: { heroTitle: 'Spring', experienceTitle: 'Piso' },
      },
      publicCopy: { publicTitle: 'Spring' },
    })
    expect(draft.landing.templateId).toBe('editorial')
    expect(draft.landing.slots.heroTitle).toBe('Spring')
    expect(draft.landing.slots.experienceTitle).toBe('Piso')
    expect(mapDraftToPreviewEvent(draft).landing.templateId).toBe('editorial')
  })

  it('se guarda con merge propio y no dentro del upsert', () => {
    expect(migration).toContain('create or replace function public.staff_merge_event_landing')
    expect(migration).toContain("jsonb_set(coalesce(rules, '{}'::jsonb), '{landing}'")
    expect(migration).toContain('event-media')
    expect(migration).toContain('pitbull-classic-2026')
    expect(migration).not.toContain('create or replace function public.staff_upsert_event')

    const server = readFileSync(resolve(process.cwd(), 'server/routes/events.js'), 'utf8')
    expect(server).toContain('staff_merge_event_landing')
  })

  it('FAQ solo publica pares completos y SEO marca custom', () => {
    expect(
      eventLandingFaqItems({
        faq1Question: '¿Hay cupo?',
        faq1Answer: 'Sí, limitado.',
        faq2Question: 'Sin respuesta',
        faq3Answer: 'Huérfana',
      }),
    ).toEqual([{ question: '¿Hay cupo?', answer: 'Sí, limitado.' }])

    const withSeo = eventLandingSeo({
      title: 'Meet X',
      landing: {
        templateId: 'editorial',
        slots: {
          heroTitle: 'Hero',
          heroLead: 'Lead del hero',
          metaTitle: 'SEO Title',
          metaDescription: 'SEO desc',
        },
      },
    })
    expect(withSeo).toMatchObject({
      title: 'SEO Title',
      description: 'SEO desc',
      hasCustomTitle: true,
      hasCustomDescription: true,
    })

    const fallback = eventLandingSeo({
      title: 'Meet X',
      landing: { templateId: 'meet', slots: { heroTitle: 'Hero', heroLead: 'Lead' } },
    })
    expect(fallback.hasCustomTitle).toBe(false)
    expect(fallback.hasCustomDescription).toBe(false)
    expect(fallback.title).toBe('Hero')
    expect(fallback.description).toBe('Lead')
  })

  it('migración FAQ/SEO reemite el merge con meta y faq', () => {
    expect(faqSeoMigration).toContain('metaTitle')
    expect(faqSeoMigration).toContain('metaDescription')
    expect(faqSeoMigration).toContain('faq1Question')
    expect(faqSeoMigration).toContain('faq3Answer')
    expect(faqSeoMigration).toContain('staff_merge_event_landing')
  })

  it('migración themeId reemite el merge con temas válidos', () => {
    expect(themeMigration).toContain('themeId')
    expect(themeMigration).toContain('plu-default')
    expect(themeMigration).toContain('night-steel')
    expect(themeMigration).toContain('ember')
    expect(themeMigration).toContain('clean-light')
    expect(themeMigration).toContain('staff_merge_event_landing')
  })

  it('la migraciÃ³n de Submission persiste plantilla, visibilidad y estado', () => {
    expect(submissionMigration).toContain('staff_merge_event_landing_state')
    expect(submissionMigration).toContain("'submission'")
    expect(submissionMigration).toContain("'publicVisible'")
    expect(submissionMigration).toContain("'coming_soon'")
  })

  it('landingPayloadForMerge incluye themeId y estado de Submission', async () => {
    const { landingPayloadForMerge } = await import('../src/lib/eventLanding.js')
    expect(
      landingPayloadForMerge({
        templateId: 'submission',
        themeId: 'ember',
        publicVisible: false,
        phase: 'published',
        slots: {},
      }),
    ).toMatchObject({
      templateId: 'submission',
      themeId: 'ember',
      publicVisible: false,
      phase: 'published',
    })
  })
})
