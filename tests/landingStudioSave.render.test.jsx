import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'
import { clearLandingStudioReopen } from '../src/lib/landingStudioSession.js'

/**
 * En el panel real, guardar desarma y vuelve a armar el editor del evento.
 * El editor visual tiene que seguir abierto después de guardar.
 */

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  date: '15 ago',
  dateISO: '2026-08-15',
  startsAt: '2026-08-15T12:00:00.000Z',
  endsAt: '2026-08-15T22:00:00.000Z',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  slots: 80,
  registered: 48,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
  landing: { templateId: 'meet', publicVisible: true, slots: {} },
}

beforeAll(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  clearLandingStudioReopen()
})

/** Como `useAppData.saveAdminEvent`: actualiza la lista y recién después resuelve. */
function Panel({ onSaved }) {
  const [events, setEvents] = useState([EVENT])
  return (
    <I18nProvider>
      <EventsSection
        adminEvents={events}
        canEdit
        canManageUsers={false}
        onSaveEvent={async (draft) => {
          const saved = { ...EVENT, landing: { ...EVENT.landing, ...draft.landing } }
          onSaved(draft)
          setEvents([saved])
          return { event: saved, events: [saved] }
        }}
        onSetEventState={async () => ({ event: events[0], events })}
        tickets={[]}
      />
    </I18nProvider>
  )
}

describe('Editor visual dentro del panel de eventos', { timeout: 30000 }, () => {
  it('guardar desde el editor visual guarda la landing y lo deja abierto', async () => {
    const onSaved = vi.fn()
    render(<Panel onSaved={onSaved} />)

    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    fireEvent.click(screen.getByRole('tab', { name: /^Página$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir editor visual' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editor visual de la landing' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'En construcción' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0].landing.publicVisible).toBe(false)

    // El editor del evento se vuelve a armar con lo guardado y el visual reabre.
    const reopened = await screen.findByRole('dialog', { name: 'Editor visual de la landing' })
    await waitFor(() =>
      expect(
        within(reopened).getByRole('button', { name: 'En construcción' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    expect(reopened.querySelector('.admin-landing-studio__status').textContent).toMatch(/Todo guardado/)
  })
})
