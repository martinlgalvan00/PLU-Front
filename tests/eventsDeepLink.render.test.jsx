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
  slug: 'test-2026',
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
  })
})
