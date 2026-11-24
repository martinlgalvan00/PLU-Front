import { describe, expect, it } from 'vitest'
import { resolveAthleteEventStatus } from '../src/lib/athleteEventStatus.js'
import { buildDocumentMeta } from '../src/lib/documentMeta.js'
import { listPublishedEventResults } from '../src/services/resultsService.js'
import { searchPublishedLifters } from '../src/services/lifterLookupService.js'

function tFactory(dict) {
  return (key, vars = {}) => {
    const value = key.split('.').reduce((acc, part) => acc?.[part], dict)
    if (typeof value !== 'string') return key
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ''))
  }
}

describe('athleteEventStatus', () => {
  const event = {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    status: 'inscripcion_abierta',
    requiresMembership: true,
  }

  it('marca guest si no hay sesión de atleta', () => {
    expect(resolveAthleteEventStatus({ event, session: null })).toBe('guest')
  })

  it('marca registered si la inscripción está confirmada', () => {
    expect(
      resolveAthleteEventStatus({
        event,
        session: { role: 'athlete_plu', athleteId: 'a1' },
        registrations: [
          { athleteId: 'a1', eventSlug: 'pitbull-classic-2026', status: 'confirmada' },
        ],
        memberships: [{ athleteId: 'a1', status: 'activa' }],
      }),
    ).toBe('registered')
  })

  it('marca needs_membership si el meet la exige y no hay afiliación', () => {
    expect(
      resolveAthleteEventStatus({
        event,
        session: { role: 'athlete_plu', athleteId: 'a1' },
        registrations: [],
        memberships: [],
      }),
    ).toBe('needs_membership')
  })
})

describe('documentMeta', () => {
  it('arma title y path por vista', () => {
    const t = tFactory({
      seo: {
        views: {
          home: { title: 'Home PLU', description: 'Desc home' },
          records: { title: 'Records PLU', description: 'Desc records' },
          eventDetail: {
            title: '{{eventTitle}} | PLU',
            description: 'Detalle {{eventTitle}}',
          },
        },
      },
    })

    expect(buildDocumentMeta('records', t).title).toBe('Records PLU')
    expect(buildDocumentMeta('records', t).path).toBe('/records')
    expect(
      buildDocumentMeta('events', t, {
        eventSlug: 'pitbull-classic-2026',
        eventTitle: 'Pitbull Classic',
      }).title,
    ).toBe('Pitbull Classic | PLU')
  })

  it('sin título de evento no deja el título en "| PLU": cae al del calendario', () => {
    const t = tFactory({
      seo: {
        views: {
          home: { title: 'Home PLU', description: 'Desc home' },
          events: { title: 'Calendario PLU', description: 'Desc calendario' },
          eventDetail: {
            title: '{{eventTitle}} | PLU',
            description: 'Detalle {{eventTitle}}',
          },
        },
      },
    })

    const meta = buildDocumentMeta('events', t, { eventSlug: 'no-existe' })
    expect(meta.title).toBe('Calendario PLU')
    // La URL compartida sigue siendo la del evento pedido.
    expect(meta.path).toBe('/evento/no-existe')
  })
})

describe('archivo de resultados', () => {
  it('publica al menos dos meets de archivo', () => {
    const meets = listPublishedEventResults()
    expect(meets.length).toBeGreaterThanOrEqual(2)
    expect(meets.map((meet) => meet.slug)).toEqual(
      expect.arrayContaining(['spring-classic-2025', 'winter-open-2025']),
    )
  })

  it('lookup encuentra atletas del winter open', () => {
    const matches = searchPublishedLifters('Martín Escobar')
    expect(matches.some((item) => item.meetSlug === 'winter-open-2025')).toBe(true)
  })
})
