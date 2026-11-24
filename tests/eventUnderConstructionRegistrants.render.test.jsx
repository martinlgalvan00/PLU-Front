import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Página del evento en preparación con la venta abierta: cupo y últimos
 * inscriptos en vivo, respetando lo que el staff decidió publicar.
 */

const live = vi.hoisted(() => ({ value: null }))

vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: () => live.value,
}))

const EventUnderConstructionPage = (await import('../src/pages/EventUnderConstructionPage.jsx'))
  .default

afterEach(cleanup)

const event = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  status: 'inscripcion_abierta',
  published: true,
  startsAt: '2027-03-06T12:00:00Z',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  landing: { templateId: 'submission', publicVisible: false },
}

function summary(patch = {}) {
  return {
    status: 'live',
    registered: 4,
    slots: 180,
    remaining: 176,
    progressPublic: false,
    totalPublic: true,
    recent: [
      { displayName: 'Johanna Contreras', gym: 'Gotham Training', registeredAt: '2026-10-26T22:27:28Z' },
    ],
    ...patch,
  }
}

function renderPage() {
  return render(
    <I18nProvider>
      <EventUnderConstructionPage event={event} onNavigate={vi.fn()} onSelectEvent={vi.fn()} />
    </I18nProvider>,
  )
}

describe('EventUnderConstructionPage · inscriptos', () => {
  it('con el avance oculto dice "Campo limitado" y muestra los últimos inscriptos', () => {
    live.value = summary()
    renderPage()
    expect(screen.getByText('Campo limitado')).toBeTruthy()
    const list = within(screen.getByRole('region', { name: /últimos inscriptos/i }))
    expect(list.getByText('Johanna Contreras')).toBeTruthy()
    expect(list.getByText('Gotham Training')).toBeTruthy()
  })

  it('con el avance público dice cuántos lugares quedan', () => {
    live.value = summary({ progressPublic: true })
    renderPage()
    expect(screen.getByText('Quedan 176 de 180')).toBeTruthy()
  })

  it('sin inscriptos públicos no dibuja la lista', () => {
    live.value = summary({ recent: [] })
    renderPage()
    expect(screen.queryByRole('region', { name: /últimos inscriptos/i })).toBeNull()
  })
})
