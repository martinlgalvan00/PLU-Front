import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventPublicMaterials from '../src/components/ui/EventPublicMaterials.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/hooks/usePublicEventSchedule.js', () => ({
  usePublicEventSchedule: () => ({
    schedule: { hasContent: false, days: [], platforms: [] },
    updatedAt: null,
  }),
}))

vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: () => ({
    status: 'live',
    recent: [
      {
        displayName: 'Carla Gomez',
        gym: 'Fuerza Sur',
        registeredAt: '2026-10-22T12:00:00Z',
      },
    ],
  }),
}))

describe('EventPublicMaterials', () => {
  it('muestra la lista reciente solo cuando el evento la habilita', () => {
    const { rerender } = render(
      <I18nProvider>
        <EventPublicMaterials
          event={{ slug: 'open-2026', publicSurface: { recentRegistrants: true } }}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Carla Gomez')).toBeTruthy()
    expect(screen.getByText('Fuerza Sur')).toBeTruthy()

    rerender(
      <I18nProvider>
        <EventPublicMaterials
          event={{ slug: 'open-2026', publicSurface: { recentRegistrants: false } }}
        />
      </I18nProvider>,
    )

    expect(screen.queryByText('Carla Gomez')).toBeNull()
  })
})
