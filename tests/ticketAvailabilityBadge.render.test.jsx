import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TicketAvailabilityBadge from '../src/components/ui/TicketAvailabilityBadge.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

function renderBadge(remaining) {
  return render(
    <I18nProvider>
      <TicketAvailabilityBadge remaining={remaining} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('TicketAvailabilityBadge', () => {
  it('con cupo holgado nombra la cifra y el tipo, sin “disponibles” de más', () => {
    renderBadge(250)
    const status = screen.getByLabelText('Quedan 250 entradas de público')
    expect(status.textContent).toContain('250')
    expect(status.textContent).toContain('entradas de público')
    expect(status.textContent).not.toContain('Disponibles')
  })

  it('con cupo justo marca la urgencia real', () => {
    renderBadge(8)
    const status = screen.getByLabelText('¡Solo 8 entradas de público!')
    expect(status.textContent).toContain('Quedan pocas')
    expect(status.textContent).toContain('entradas de público')
  })

  it('agotado se lee como una sola frase', () => {
    renderBadge(0)
    expect(screen.getByLabelText('Entradas de público agotadas')).toBeTruthy()
  })
})
