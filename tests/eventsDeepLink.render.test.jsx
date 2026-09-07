import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/eventAdminService.js', () => ({
  fetchPublishedEvents: vi.fn(async () => []),
}))

const EventsPage = (await import('../src/pages/EventsPage.jsx')).default

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

const pitbull = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  dateISO: '2026-12-12',
  venue: 'Maximal',
  location: 'Buenos Aires',
  status: 'proximamente',
  featured: false,
}

const linkedEvent = {
  slug: 'regional-norte-2026',
  title: 'Evento enlazado',
  dateISO: '2026-08-13',
  venue: 'PLU',
  location: 'Banfield',
  status: 'inscripcion_abierta',
  featured: true,
}

describe('deep-link de eventos con datos asincronos', () => {
  it('selecciona el slug solicitado cuando el catalogo real llega despues del primer render', async () => {
    const props = {
      initialEventSlug: linkedEvent.slug,
      onNavigate: vi.fn(),
      onSelectEvent: vi.fn(),
      session: null,
    }

    const { container, rerender } = render(
      <I18nProvider>
        <EventsPage {...props} events={[pitbull]} />
      </I18nProvider>,
    )

    rerender(
      <I18nProvider>
        <EventsPage {...props} events={[pitbull, linkedEvent]} />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.events-detail__title')?.textContent).toBe(linkedEvent.title)
    })

    expect(container.querySelector('.events-detail__spotlight')).toBeNull()
    expect(container.querySelector('.events-detail__date-hero')).toBeNull()
    expect(container.textContent).not.toMatch(/Creá tu ficha para inscribirte/)
    expect(container.querySelector('.events-detail__athlete-hint')?.textContent).toMatch(
      /cuenta de atleta/i,
    )
  })

  it('no lista stubs de desarrollo en el catalogo publico', async () => {
    const stub = {
      slug: 'test-2026',
      title: 'test',
      dateISO: '2026-08-13',
      venue: 'test',
      location: 'asd',
      status: 'inscripcion_abierta',
      featured: true,
    }

    const { container } = render(
      <I18nProvider>
        <EventsPage
          events={[pitbull, stub]}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
          session={null}
        />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.events-detail__title')?.textContent).toBe(pitbull.title)
    })

    const titles = [...container.querySelectorAll('.event-card__title')].map((node) => node.textContent)
    expect(titles).toEqual([pitbull.title])
    expect(container.textContent).not.toMatch(/\btest\b/i)
  })

  it('muestra pesajes del evento y los oculta si no hay ventanas', async () => {
    const withWindows = {
      ...pitbull,
      weighInWindows: [
        {
          id: 'weighin-1',
          label: 'Sábado',
          date: '2026-12-12',
          startsAt: '2026-12-12T07:00',
          endsAt: '2026-12-12T08:30',
          note: 'Último llamado.',
          sortOrder: 0,
        },
      ],
    }

    const emptyRender = render(
      <I18nProvider>
        <EventsPage events={[pitbull]} onNavigate={vi.fn()} onSelectEvent={vi.fn()} session={null} />
      </I18nProvider>,
    )
    expect(emptyRender.container.querySelector('.events-detail__weighins')).toBeNull()
    emptyRender.unmount()

    const { container } = render(
      <I18nProvider>
        <EventsPage
          events={[withWindows]}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
          session={null}
        />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.events-detail__weighins')).not.toBeNull()
    })
    expect(container.querySelector('.events-detail__weighins')?.textContent).toContain('Sábado')
    expect(container.querySelector('.events-detail__weighins')?.textContent).toContain(
      '07:00 — 08:30',
    )
  })
})
