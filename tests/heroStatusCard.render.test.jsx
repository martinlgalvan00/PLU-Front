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

  it('si hay entradas en venta lo dice y lleva a ver el evento', () => {
    const onSelect = vi.fn()
    renderCard({
      onSelect,
      ticketsAvailable: true,
      statusLabelOverride: 'Entradas disponibles',
    })

    const button = document.querySelector('button.hero-meta--tickets')
    const hanging = button?.querySelector('.hero-meta__tickets')
    const panel = button?.querySelector('.hero-meta__panel')
    expect(button).not.toBeNull()
    expect(hanging).not.toBeNull()
    expect(button.getAttribute('aria-label')).toContain('Entradas disponibles')
    expect(hanging.textContent).toContain('Entradas disponibles')
    expect(hanging.textContent).toContain('Ver evento')
    expect(panel.textContent).not.toContain('Entradas disponibles')
    expect(button.textContent).not.toContain('Cerrado')

    fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
