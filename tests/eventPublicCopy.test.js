import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  eventPublicTitle,
  normalizeEventPublicCopy,
} from '../src/lib/eventPublicSurface.js'
import { buildAdminEventDraft, mapDraftToPreviewEvent } from '../src/services/eventAdminService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261106100000_event_public_copy.sql'),
  'utf8',
)

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  dateISO: '2026-12-12',
  venue: 'La Troupe',
  location: 'Banfield',
  status: 'inscripcion_abierta',
  slots: 180,
}

describe('copy público del evento', () => {
  it('recorta, limita y no inventa', () => {
    expect(normalizeEventPublicCopy(null)).toEqual({
      publicTitle: '',
      heroLead: '',
      ctaLabel: '',
    })
    expect(
      normalizeEventPublicCopy({ publicTitle: '  Pitbull  ', heroLead: '', ctaLabel: null }),
    ).toEqual({ publicTitle: 'Pitbull', heroLead: '', ctaLabel: '' })
    expect(normalizeEventPublicCopy({ publicTitle: 'x'.repeat(200) }).publicTitle).toHaveLength(120)
    expect(normalizeEventPublicCopy({ heroLead: 'y'.repeat(300) }).heroLead).toHaveLength(240)
    expect(normalizeEventPublicCopy({ ctaLabel: 'z'.repeat(80) }).ctaLabel).toHaveLength(40)
  })

  /** Vacío tiene que caer al título del evento, no dejar el hero en blanco. */
  it('el título público cae al del evento cuando no se cargó', () => {
    expect(eventPublicTitle({ ...EVENT, publicCopy: { publicTitle: 'La Clásica' } })).toBe(
      'La Clásica',
    )
    expect(eventPublicTitle({ ...EVENT, publicCopy: { publicTitle: '   ' } })).toBe(
      'Pitbull Classic 2026',
    )
    expect(eventPublicTitle(EVENT)).toBe('Pitbull Classic 2026')
  })

  it('viaja en el draft del panel y en la vista previa', () => {
    const draft = buildAdminEventDraft({
      ...EVENT,
      publicCopy: { publicTitle: 'La Clásica', heroLead: 'Fecha nacional.', ctaLabel: 'Competir' },
    })

    expect(draft.publicCopy).toEqual({
      publicTitle: 'La Clásica',
      heroLead: 'Fecha nacional.',
      ctaLabel: 'Competir',
    })

    // La preview de Vista pública tiene que mostrar lo mismo que se guarda.
    expect(mapDraftToPreviewEvent(draft, EVENT).publicCopy).toEqual(draft.publicCopy)
  })

  /**
   * `staff_upsert_event` reconstruye `rules` clave por clave con
   * `jsonb_build_object`, así que una clave que no esté listada ahí se pierde
   * en el próximo guardado. Por eso el copy va en su propio merge, igual que
   * `publicSurface` -- si alguien lo mueve adentro del upsert, esto avisa.
   */
  it('se guarda con un merge propio y no dentro del upsert', () => {
    expect(migration).toContain('create or replace function public.staff_merge_event_public_copy')
    expect(migration).toContain("jsonb_set(coalesce(rules, '{}'::jsonb), '{publicCopy}'")
    expect(migration).toContain('jsonb_strip_nulls')
    // Lo nombra en el comentario para explicar por qué el merge va aparte,
    // pero no lo reemite: reemitir 555 líneas para agregar una clave es
    // exactamente el riesgo que este patrón evita.
    expect(migration).not.toContain('create or replace function public.staff_upsert_event')

    const server = readFileSync(resolve(process.cwd(), 'server/routes/events.js'), 'utf8')
    expect(server).toContain('staff_merge_event_public_copy')
  })
})
