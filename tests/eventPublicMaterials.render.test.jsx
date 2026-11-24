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

vi.mock('../src/lib/credentialQr.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generateCredentialQr: vi.fn(async () => 'data:image/png;base64,QR'),
}))

describe('EventPublicMaterials — formulario de Google', () => {
  const surface = { recentRegistrants: false, schedule: false }
  const FORM = { url: 'https://forms.gle/AbC123xyz', label: 'Contanos tu experiencia' }

  it('con un link cargado ofrece el botón y el QR', async () => {
    render(
      <I18nProvider>
        <EventPublicMaterials event={{ slug: 'open-2026', publicSurface: surface, externalForm: FORM }} />
      </I18nProvider>,
    )
    const link = screen.getByRole('link', { name: /contanos tu experiencia/i })
    expect(link.getAttribute('href')).toBe(FORM.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(await screen.findByRole('img', { name: /código qr/i })).toBeTruthy()
  })

  it('sin etiqueta usa un texto por defecto', () => {
    render(
      <I18nProvider>
        <EventPublicMaterials
          event={{ slug: 'open-2026', publicSurface: surface, externalForm: { url: FORM.url, label: '' } }}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('link', { name: /responder el formulario/i })).toBeTruthy()
  })

  it('sin link no muestra nada (y no renderiza el contenedor vacío)', () => {
    const { container } = render(
      <I18nProvider>
        <EventPublicMaterials event={{ slug: 'open-2026', publicSurface: surface }} />
      </I18nProvider>,
    )
    expect(container.querySelector('.event-public-materials')).toBeNull()
  })

  it('un link que no es de Google Forms nunca se publica', () => {
    const { container } = render(
      <I18nProvider>
        <EventPublicMaterials
          event={{
            slug: 'open-2026',
            publicSurface: surface,
            externalForm: { url: 'javascript:alert(1)', label: 'x' },
          }}
        />
      </I18nProvider>,
    )
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(container.querySelector('.event-public-materials')).toBeNull()
  })
})

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
