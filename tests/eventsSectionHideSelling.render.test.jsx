import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Ocultar un evento desde la lista corta su venta (`hidden` bloquea el cobro).
 * Con la venta abierta o programada se avisa y se ofrece "En construcción",
 * que oculta solo la landing y deja inscribirse.
 */

const SELLING = {
  id: 'evt-bs',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  date: '6 mar',
  dateISO: '2027-03-06',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'inscripcion_abierta',
  published: true,
  featured: false,
  slots: 120,
  registered: 0,
  salesIntent: 'charge',
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
}

const NOT_SELLING = {
  ...SELLING,
  id: 'evt-closed',
  slug: 'winter-open-2026',
  title: 'Winter Open',
  status: 'proximamente',
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderEvents(events, onSetEventState) {
  return render(
    <I18nProvider>
      <EventsSection
        adminEvents={events}
        canEdit
        canManageUsers={false}
        onSaveEvent={async () => ({ event: events[0], events })}
        onSetEventState={onSetEventState}
        tickets={[]}
      />
    </I18nProvider>,
  )
}

describe('EventsSection — ocultar un evento que vende', () => {
  it('avisa que corta la venta y sugiere "En construcción"; cancelar no lo oculta', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onSetEventState = vi.fn(async () => ({ event: SELLING, events: [SELLING] }))
    renderEvents([SELLING], onSetEventState)

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Barbell Submission del sitio' }))

    expect(confirm).toHaveBeenCalledTimes(1)
    const message = confirm.mock.calls[0][0]
    expect(message).toContain('corta la venta de inscripciones')
    expect(message).toContain('• Barbell Submission')
    expect(message).toContain('«En construcción»')
    expect(onSetEventState).not.toHaveBeenCalled()
  })

  it('confirmado, lo oculta igual', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSetEventState = vi.fn(async () => ({ event: SELLING, events: [SELLING] }))
    renderEvents([SELLING], onSetEventState)

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Barbell Submission del sitio' }))

    await waitFor(() =>
      expect(onSetEventState).toHaveBeenCalledWith('barbell-submission-2027', { published: false }),
    )
  })

  it('con la venta programada también avisa', () => {
    const scheduled = { ...SELLING, registrationOpensAt: '2099-01-10T15:00:00Z' }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEvents([scheduled], vi.fn())

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Barbell Submission del sitio' }))

    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('sin venta abierta lo oculta sin preguntar', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const onSetEventState = vi.fn(async () => ({ event: NOT_SELLING, events: [NOT_SELLING] }))
    renderEvents([NOT_SELLING], onSetEventState)

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Winter Open del sitio' }))

    await waitFor(() =>
      expect(onSetEventState).toHaveBeenCalledWith('winter-open-2026', { published: false }),
    )
    expect(confirm).not.toHaveBeenCalled()
  })
})
