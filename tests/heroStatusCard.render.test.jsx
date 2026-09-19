import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import HeroStatusCard from '../src/components/ui/HeroStatusCard.jsx'

afterEach(cleanup)

function renderCard(props = {}) {
  return render(
    <I18nProvider>
      <HeroStatusCard event={{ status: 'cerrado' }} {...props} />
    </I18nProvider>,
  )
}

describe('HeroStatusCard', () => {
  it('con la inscripción cerrada no inventa que se puede competir', () => {
    renderCard()
    expect(document.body.textContent).toContain('Cerrado')
    expect(document.body.textContent).not.toContain('Entradas disponibles')
  })

  it('si hay entradas en venta, toda la ficha abre la compra y no el evento', () => {
    const onSelect = vi.fn()
    const onSelectTickets = vi.fn()
    renderCard({
      onSelect,
      onSelectTickets,
      ticketsAvailable: true,
      statusLabelOverride: 'Entradas disponibles',
    })

    const shell = document.querySelector('.hero-meta--tickets')
    const hanging = shell?.querySelector('.hero-meta__tickets')
    const panel = shell?.querySelector('.hero-meta__panel')
    expect(shell?.tagName).toBe('BUTTON')
    expect(hanging).not.toBeNull()
    expect(shell.getAttribute('aria-label')).toContain('Entradas disponibles')
    expect(hanging.textContent).toContain('Entradas disponibles')
    expect(hanging.textContent).toContain('Ver entradas')
    expect(hanging.textContent).not.toContain('Ver evento')
    expect(panel.textContent).not.toContain('Entradas disponibles')
    expect(shell.textContent).not.toContain('Cerrado')

    fireEvent.click(panel)
    expect(onSelectTickets).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(hanging)
    expect(onSelectTickets).toHaveBeenCalledTimes(2)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
