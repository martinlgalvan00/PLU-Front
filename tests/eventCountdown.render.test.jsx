import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventCountdown from '../src/components/ui/EventCountdown.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T09:00:00-03:00'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderCountdown(event) {
  return render(
    <I18nProvider>
      <EventCountdown event={event} compact />
    </I18nProvider>,
  )
}

const readTicker = (container) =>
  [...container.querySelectorAll('.event-countdown__unit')].map((unit) => [
    unit.querySelector('.event-countdown__value')?.textContent,
    unit.querySelector('.event-countdown__label')?.textContent,
  ])

describe('EventCountdown', () => {
  it('cuenta en semanas cuando falta más de una, como el resto de los contadores', () => {
    const { container } = renderCountdown({
      title: 'Pitbull Classic',
      startsAt: '2026-12-12T09:00:00-03:00',
    })

    expect(readTicker(container)).toEqual([
      ['08', 'semanas'],
      ['05', 'días'],
      ['00', 'hs'],
    ])
  })

  it('usa singular y cae a dateISO a las 09:00 de Argentina', () => {
    vi.setSystemTime(new Date('2026-10-03T09:00:00-03:00'))
    const { container } = renderCountdown({ title: 'Meet', dateISO: '2026-10-10' })

    expect(readTicker(container)[0]).toEqual(['01', 'semana'])
  })

  it('no se muestra si el evento ya empezó o no tiene fecha', () => {
    const past = renderCountdown({ title: 'Meet', startsAt: '2026-10-01T09:00:00-03:00' })
    expect(past.container.firstChild).toBeNull()
    cleanup()
    const undated = renderCountdown({ title: 'Meet' })
    expect(undated.container.firstChild).toBeNull()
  })
})
