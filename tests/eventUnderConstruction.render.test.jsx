import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventUnderConstructionPage from '../src/pages/EventUnderConstructionPage.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import {
  getCompetitionNavEvents,
  getPublicCatalogEvents,
  getUnderConstructionEvents,
  isUnderConstructionEvent,
} from '../src/lib/eventNavigation.js'
import { mapSupabaseEventRow } from '../src/services/eventAdminService.js'
import { underConstructionCatalogEvent } from '../server/services/publicEventCatalogService.js'

afterEach(cleanup)

const hiddenRow = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  rules: { landing: { templateId: 'submission', themeId: 'ember', publicVisible: false } },
}

// Lo que recibe el cliente del catálogo: el stub del servidor, ya mapeado.
const hiddenEvent = mapSupabaseEventRow(underConstructionCatalogEvent(hiddenRow))

const openEvent = {
  id: 'evt-2',
  slug: 'winter-open-2026',
  title: 'Winter Open',
  startsAt: '2026-12-12T12:00:00Z',
  dateISO: '2026-12-12',
  status: 'inscripcion_abierta',
  published: true,
  landing: { templateId: 'meet', publicVisible: true },
}

describe('landing en construcción — datos', () => {
  it('el stub mapeado se reconoce como "en construcción"', () => {
    expect(isUnderConstructionEvent(hiddenEvent)).toBe(true)
    expect(isUnderConstructionEvent(openEvent)).toBe(false)
  })

  it('sale de listados y navegación de competencia, pero se puede listar aparte', () => {
    const all = [hiddenEvent, openEvent]
    expect(getPublicCatalogEvents(all).map((event) => event.slug)).toEqual(['winter-open-2026'])
    expect(
      getCompetitionNavEvents(all, new Date('2026-10-01T00:00:00Z')).map((event) => event.slug),
    ).toEqual(['winter-open-2026'])
    expect(getUnderConstructionEvents(all).map((event) => event.slug)).toEqual([
      'barbell-submission-2027',
    ])
  })

  it('un evento despublicado no aparece ni como "en construcción"', () => {
    expect(getUnderConstructionEvents([{ ...hiddenEvent, published: false }])).toEqual([])
  })
})

describe('EventUnderConstructionPage', () => {
  function renderPage(props = {}) {
    return render(
      <I18nProvider>
        <EventUnderConstructionPage event={hiddenEvent} onNavigate={() => {}} {...props} />
      </I18nProvider>,
    )
  }

  it('dice "Plataforma en construcción" con el nombre del evento y nada más', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Barbell Submission' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/plataforma en construcción/i)
  })

  it('usa el tema del evento', () => {
    const { container } = renderPage()
    expect(container.querySelector('main')?.getAttribute('data-event-theme')).toBe('ember')
  })

  it('ofrece volver al calendario', () => {
    const onNavigate = vi.fn()
    renderPage({ onNavigate })

    fireEvent.click(screen.getByRole('button', { name: /volver al calendario/i }))
    expect(onNavigate).toHaveBeenCalledWith('events')
    fireEvent.click(screen.getByRole('button', { name: /ver el calendario/i }))
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })
})

describe('EventUnderConstructionPage · escena interactiva', () => {
  it('muestra la barra con los controles y respeta la animación del evento', () => {
    const quiet = mapSupabaseEventRow(
      underConstructionCatalogEvent({
        ...hiddenRow,
        rules: { landing: { ...hiddenRow.rules.landing, layout: { motion: 'none' } } },
      }),
    )
    const { container } = render(
      <I18nProvider>
        <EventUnderConstructionPage event={quiet} onNavigate={vi.fn()} />
      </I18nProvider>,
    )
    expect(container.querySelector('main').dataset.motion).toBe('none')
    expect(screen.getByRole('img', { name: /barra olímpica cargada con/i })).toBeTruthy()
    expect(screen.getByRole('group', { name: /cargar la barra/i })).toBeTruthy()
    // Una sola vía de salida primaria: el CTA al calendario sigue ahí.
    expect(screen.getByRole('button', { name: /ver el calendario/i })).toBeTruthy()
  })
})
