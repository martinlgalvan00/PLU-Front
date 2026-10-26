import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import HomeSeasonActions from '../src/components/ui/HomeSeasonActions.jsx'

afterEach(cleanup)

const ACTIONS_OPEN = [
  {
    kind: 'tickets',
    event: {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'La Troupe',
      location: 'Banfield',
      startsAt: '2026-12-12T09:00:00-03:00',
      endsAt: '2026-12-13T20:00:00-03:00',
    },
  },
  {
    kind: 'registration',
    event: {
      slug: 'barbell-submission-2027',
      title: 'Barbell Submission',
      venue: 'Virtus fitness',
      location: 'Berazategui',
      startsAt: '2027-03-06T14:41:00-03:00',
      endsAt: '2027-03-07T14:41:00-03:00',
    },
  },
]

const ACTIONS_SOON = [
  ACTIONS_OPEN[0],
  {
    ...ACTIONS_OPEN[1],
    kind: 'registration_soon',
  },
]

describe('HomeSeasonActions', () => {
  it('inscripción abierta: el carril lleva "Página oficial" e "Inscribirme"', () => {
    const onActivate = vi.fn()
    render(
      <I18nProvider>
        <HomeSeasonActions actions={ACTIONS_OPEN} onActivate={onActivate} />
      </I18nProvider>,
    )

    expect(screen.getByText('Ya podés inscribirte')).toBeTruthy()
    const lane = screen.getByRole('group', { name: 'Barbell Submission' })
    expect(lane.tagName).not.toBe('BUTTON')

    fireEvent.click(screen.getByRole('button', { name: 'Página oficial de Barbell Submission' }))
    // El segundo argumento es el click: el carril lo usa para el morph de ruta.
    expect(onActivate).toHaveBeenLastCalledWith(ACTIONS_OPEN[1], expect.anything(), 'page')

    fireEvent.click(screen.getByRole('button', { name: /Barbell Submission\. Inscripción abierta/i }))
    expect(onActivate).toHaveBeenLastCalledWith(ACTIONS_OPEN[1], expect.anything(), 'register')
  })

  it('con Virtus en teaser dice Inscripciones próximamente, no finalizadas', () => {
    const onActivate = vi.fn()
    render(
      <I18nProvider>
        <HomeSeasonActions actions={ACTIONS_SOON} onActivate={onActivate} />
      </I18nProvider>,
    )

    expect(screen.getByText('Inscripciones próximamente')).toBeTruthy()
    expect(screen.getByText('Ver ficha')).toBeTruthy()
    expect(screen.getByText('Comprar')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/finalizad/i)

    fireEvent.click(screen.getByRole('button', { name: /Barbell Submission/i }))
    // El segundo argumento es el click: el carril lo usa para el morph de ruta.
    expect(onActivate).toHaveBeenCalledWith(ACTIONS_SOON[1], expect.anything())
  })

  it('no renderiza nada sin acciones', () => {
    const { container } = render(
      <I18nProvider>
        <HomeSeasonActions actions={[]} />
      </I18nProvider>,
    )
    expect(container.querySelector('.home-season-actions')).toBeNull()
  })
})
