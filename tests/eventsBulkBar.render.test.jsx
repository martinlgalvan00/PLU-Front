import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * La barra de selección en lote no aparece mientras no haya nada elegido (no hay
 * qué aplicar) y, una vez visible, se cierra con una X que sale del modo selección.
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

const EVENTS = [
  { ...BASE, id: 'e1', slug: 'copa-norte-2026', title: 'Copa Norte', dateISO: '2026-11-10' },
  { ...BASE, id: 'e2', slug: 'copa-sur-2026', title: 'Copa Sur', dateISO: '2026-12-12', published: false },
]

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => cleanup())

function renderEvents() {
  render(
    <I18nProvider>
      <EventsSection
        adminEvents={EVENTS}
        canEdit
        canManageUsers={false}
        onSetEventState={vi.fn(async () => ({ events: [] }))}
        tickets={[]}
      />
    </I18nProvider>,
  )
}

const bar = () => screen.queryByRole('group', { name: /visibilidad de los eventos elegidos/i })

describe('EventsSection — barra de selección en lote', () => {
  it('no aparece al entrar en «Seleccionar» sin haber elegido nada', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))

    expect(screen.getByRole('checkbox', { name: 'Seleccionar Copa Norte' })).toBeTruthy()
    expect(bar()).toBeNull()
  })

  it('aparece con la primera selección y desaparece al soltarla', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    const checkbox = screen.getByRole('checkbox', { name: 'Seleccionar Copa Norte' })

    fireEvent.click(checkbox)
    expect(bar()).not.toBeNull()
    expect(screen.getByText('1 seleccionado')).toBeTruthy()

    fireEvent.click(checkbox)
    expect(bar()).toBeNull()
  })

  it('la X cierra la selección y limpia lo elegido', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))
    expect(bar()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la selección' }))

    expect(bar()).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Seleccionar' })).toBeTruthy()
  })
})
