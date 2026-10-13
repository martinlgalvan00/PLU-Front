import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Cabeceras del calendario en el listado de Eventos: con varios años el año
 * titula el capítulo y el mes no lo repite ("2026 / Noviembre", no
 * "2026 / Noviembre de 2026"); con uno solo, el mes lleva el año. El aviso de
 * eventos sin publicar vive en la línea del resumen, no en una franja aparte.
 */
vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformFeatureToggles: vi.fn(async () => ({
    checkoutEnabled: true,
    environmentHolds: [],
    paymentChannels: {},
  })),
}))

const BASE = {
  description: '',
  venue: 'Club Central',
  location: 'Rosario',
  status: 'proximamente',
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 0,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
  published: true,
}

const MULTI_YEAR = [
  { ...BASE, id: 'e1', slug: 'copa-norte-2026', title: 'Copa Norte', dateISO: '2026-11-10' },
  {
    ...BASE,
    id: 'e2',
    slug: 'copa-sur-2027',
    title: 'Copa Sur',
    dateISO: '2027-03-12',
    published: false,
  },
]

const SINGLE_YEAR = MULTI_YEAR.slice(0, 1)

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => cleanup())

function renderEvents(adminEvents) {
  render(
    <I18nProvider>
      <EventsSection
        adminEvents={adminEvents}
        canEdit
        canManageUsers={false}
        onSetEventState={vi.fn(async () => ({}))}
        tickets={[]}
      />
    </I18nProvider>,
  )
}

const chapterLabels = () =>
  [...document.querySelectorAll('.admin-event-chapter__label')].map((node) => node.textContent)
// El primer span es el nombre del grupo; el <strong> que le sigue es su conteo.
const groupLabels = () =>
  [...document.querySelectorAll('.admin-event-group__label > span')].map((node) => node.textContent)

describe('EventsSection — cabeceras del calendario', () => {
  it('con varios años, el año titula el capítulo y el mes no lo repite', () => {
    renderEvents(MULTI_YEAR)
    fireEvent.click(screen.getByRole('tab', { name: /todos/i }))

    expect(chapterLabels()).toEqual(['2026', '2027'])
    expect(groupLabels()).toEqual(['Noviembre', 'Marzo'])
  })

  it('con un solo año, el mes lleva el año', () => {
    renderEvents(SINGLE_YEAR)

    expect(document.querySelector('.admin-event-chapter__label')).toBeNull()
    expect(groupLabels()).toEqual(['Noviembre de 2026'])
  })

  it('el aviso de ocultos queda dentro de la línea del resumen', () => {
    renderEvents(MULTI_YEAR)
    fireEvent.click(screen.getByRole('tab', { name: /todos/i }))

    const summary = document.querySelector('.admin-events-summary')
    expect(summary?.querySelector('.admin-events__unpublished')).not.toBeNull()
    expect(summary?.querySelector('.admin-events-kpis')).not.toBeNull()
  })
})
