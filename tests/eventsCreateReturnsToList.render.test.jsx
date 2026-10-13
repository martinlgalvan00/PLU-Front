import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'
import { invalidatePlatformPaymentChannels } from '../src/hooks/usePlatformPaymentChannels.js'

/**
 * Después de crear un evento se vuelve a la lista y el evento se ve ahí, aunque
 * un filtro previo (el año por defecto) lo hubiera escondido. Antes el alta abría
 * la consola y obligaba a entrar a ella para publicar. La publicación se resuelve
 * en el alta y con un toque desde la fila.
 */
vi.mock('../src/services/paymentProfileService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPaymentProfiles: vi.fn(async () => ({ profiles: [], secretsKeyConfigured: true })),
}))

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      checkoutEnabled: true,
      environmentHolds: [],
      paymentChannels: {
        membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        ticket: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
      },
    })),
  }
})

const BASE = {
  description: '',
  date: '15 ago',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'proximamente',
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 0,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
}

const EXISTING = {
  ...BASE,
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  dateISO: '2026-08-15',
  published: true,
}
const HIDDEN = {
  ...BASE,
  id: 'evt-2',
  slug: 'copa-otono-2026',
  title: 'Copa Otoño',
  dateISO: '2026-09-10',
  published: false,
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  invalidatePlatformPaymentChannels()
  vi.restoreAllMocks()
})

/** Guarda de verdad: la lista que recibe EventsSection crece como en la app. */
function Harness({ initial, onSaveEvent, onSetEventState }) {
  const [events, setEvents] = useState(initial)
  return (
    <I18nProvider>
      <EventsSection
        adminEvents={events}
        canEdit
        canDeleteEvents={false}
        canManageUsers={false}
        tickets={[]}
        onSaveEvent={async (draft) => {
          const saved = await onSaveEvent(draft)
          setEvents((current) => [...current, saved.event])
          return saved
        }}
        onSetEventState={async (slug, changes) => {
          const result = await onSetEventState(slug, changes)
          setEvents((current) =>
            current.map((event) => (event.slug === slug ? { ...event, ...changes } : event)),
          )
          return result
        }}
      />
    </I18nProvider>
  )
}

function renderHarness(initial = [EXISTING, HIDDEN]) {
  const onSaveEvent = vi.fn(async (draft) => ({
    event: { ...BASE, ...draft, id: 'evt-new', dateISO: String(draft.startsAt).slice(0, 10) },
  }))
  const onSetEventState = vi.fn(async () => ({ events: [] }))
  render(<Harness initial={initial} onSaveEvent={onSaveEvent} onSetEventState={onSetEventState} />)
  return { onSaveEvent, onSetEventState }
}

function fillRequired({ title = 'Copa Primavera', start = '2027-03-12T10:00' } = {}) {
  fireEvent.change(screen.getByLabelText('Título público'), { target: { value: title } })
  fireEvent.change(document.getElementById('quick-event-starts-at'), { target: { value: start } })
  fireEvent.change(document.getElementById('quick-event-ends-at'), {
    target: { value: start.replace('10:00', '18:00') },
  })
  fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club Central' } })
  fireEvent.change(document.getElementById('quick-event-location'), { target: { value: 'Rosario' } })
}

describe('alta de un evento: vuelve a la lista', () => {
  it('muestra el evento nuevo en la lista aunque sea de otro año, sin abrir la consola', async () => {
    renderHarness()
    // Con eventos de 2026 el filtro de año arranca en 2026: uno de 2027 quedaría escondido.
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    const list = await screen.findByRole('list', { name: 'Evento' })
    const row = await within(list).findByTitle(/^Copa Primavera · /)
    expect(row.closest('.admin-event-row')?.classList.contains('admin-event-row--new')).toBe(true)
    expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull()
  })

  it('crea oculto por defecto y publicado si se elige en el alta', async () => {
    const hidden = renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(hidden.onSaveEvent).toHaveBeenCalledTimes(1))
    expect(hidden.onSaveEvent.mock.calls[0][0].published).toBe(false)

    cleanup()
    const published = renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Publicado' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(published.onSaveEvent).toHaveBeenCalledTimes(1))
    expect(published.onSaveEvent.mock.calls[0][0].published).toBe(true)
  })
})

describe('publicar desde la fila', () => {
  it('un toque publica un evento oculto, sin abrir la consola', async () => {
    const { onSetEventState } = renderHarness()
    fireEvent.click(screen.getByRole('button', { name: /Publicar Copa Otoño/ }))

    await waitFor(() =>
      expect(onSetEventState).toHaveBeenCalledWith('copa-otono-2026', { published: true }),
    )
    expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull()
    expect(await screen.findByRole('button', { name: /Ocultar Copa Otoño/ })).toBeTruthy()
  })

  it('sin permiso de edición el estado se lee pero no se opera', () => {
    render(
      <I18nProvider>
        <EventsSection
          adminEvents={[EXISTING, HIDDEN]}
          canEdit={false}
          canManageUsers={false}
          tickets={[]}
        />
      </I18nProvider>,
    )
    expect(screen.queryByRole('button', { name: /Publicar Copa Otoño/ })).toBeNull()
    const row = document.querySelector('[data-event-id="evt-2"]')
    expect(row?.querySelector('.admin-event-row__vis--static')?.textContent).toBe('Oculto')
  })
})
