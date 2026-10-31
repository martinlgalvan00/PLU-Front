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

  it('dice "Próximamente" con el nombre del evento y nada más', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Barbell Submission' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/próximamente/i)
  })

  it('usa el tema del evento', () => {
    const { container } = renderPage()
    expect(container.querySelector('main')?.getAttribute('data-event-theme')).toBe('ember')
    expect(container.querySelector('main')?.getAttribute('data-template')).toBe('submission')
  })

  it('muestra el logo del evento cuando tiene uno', () => {
    const { container } = renderPage({
      event: { ...hiddenEvent, logoUrl: 'https://cdn.example/barbell.png' },
    })
    const logo = container.querySelector('.event-under-construction__logo')
    expect(logo?.getAttribute('src')).toBe('https://cdn.example/barbell.png')
    expect(logo?.getAttribute('alt')).toBe('')
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

describe('EventUnderConstructionPage · portada', () => {
  it('respeta "Sin animaciones" del evento y no muestra la escena de juego', () => {
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
    // La barra con "Sacar/Sumar discos" se leía como un juego: ya no está.
    expect(screen.queryByRole('group', { name: /cargar la barra/i })).toBeNull()
    // Una sola vía de salida primaria: el CTA al calendario sigue ahí.
    expect(screen.getByRole('button', { name: /ver el calendario/i })).toBeTruthy()
  })

  it('sin logo no dibuja el emblema', () => {
    const { container } = render(
      <I18nProvider>
        <EventUnderConstructionPage event={hiddenEvent} onNavigate={vi.fn()} />
      </I18nProvider>,
    )
    expect(container.querySelector('.event-under-construction__emblem')).toBeNull()
    expect(container.querySelector('main').dataset.emblem).toBeUndefined()
  })
})

describe('EventUnderConstructionPage · inscripción con la página oculta', () => {
  const sellingEvent = {
    ...hiddenEvent,
    status: 'inscripcion_abierta',
    published: true,
    startsAt: '2027-03-06T12:00:00Z',
    venue: 'Virtus Fitness',
    location: 'Berazategui',
  }

  function renderSelling(event, props = {}) {
    return render(
      <I18nProvider>
        <EventUnderConstructionPage
          event={event}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
          {...props}
        />
      </I18nProvider>,
    )
  }

  it('dice que se construye la página oficial del evento por su nombre', () => {
    renderSelling(hiddenEvent)
    expect(screen.getByText(/preparando la página oficial de Barbell Submission/i)).toBeTruthy()
  })

  it('con la venta abierta ofrece "Inscribirme" con fecha y sede', () => {
    const onSelectEvent = vi.fn()
    const { container } = renderSelling(sellingEvent, { onSelectEvent })

    expect(container.querySelector('main').dataset.registration).toBe('open')
    // Un solo estado: abierta. Antes decía "Próximamente" y "ya está abierta" a la vez.
    expect(screen.getByRole('status').textContent).toMatch(/inscripción abierta/i)
    expect(screen.getByRole('status').textContent).not.toMatch(/próximamente/i)
    expect(screen.getByText('Virtus Fitness')).toBeTruthy()
    expect(screen.getByText('Berazategui')).toBeTruthy()
    expect(screen.getByText(/2027/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(onSelectEvent).toHaveBeenCalledWith(sellingEvent)
    // El calendario queda como salida secundaria.
    expect(screen.getByRole('button', { name: /ver el calendario/i })).toBeTruthy()
  })

  it('cuenta los días que faltan para el evento', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-03-01T12:00:00Z'))
    try {
      renderSelling(sellingEvent)
      expect(screen.getByText('5')).toBeTruthy()
      expect(screen.getByText('días')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('programada: dice cuándo abre y no ofrece inscribirse todavía', () => {
    const { container } = renderSelling({
      ...sellingEvent,
      registrationOpensAt: '2099-01-10T15:00:00Z',
    })
    expect(container.querySelector('main').dataset.registration).toBe('scheduled')
    expect(screen.getByText(/la inscripción abre el/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
  })

  it.each([
    ['cerrada', { status: 'cerrado' }],
    ['solo anuncio', { salesIntent: 'announce' }],
  ])('%s: no ofrece inscribirse ni muestra fecha o sede', (_label, patch) => {
    const { container } = renderSelling({ ...sellingEvent, ...patch })
    expect(container.querySelector('main').dataset.registration).toBe('closed')
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
    expect(screen.queryByText(/Virtus/)).toBeNull()
  })

  it('con las inscripciones pausadas en la plataforma no ofrece el botón', () => {
    renderSelling(sellingEvent, { registrationEnabled: false })
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
  })
})
