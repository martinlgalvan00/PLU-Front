import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import SeasonComboOffer from '../src/components/ui/SeasonComboOffer.jsx'

afterEach(cleanup)

function renderOffer(props = {}) {
  return render(
    <I18nProvider>
      <SeasonComboOffer
        variant="band"
        membershipPrice={75000}
        registrationPrice={75000}
        comboPrice={120000}
        endsAt="2026-08-28T23:59:59-03:00"
        onCta={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('SeasonComboOffer', () => {
  it('muestra el ledger, el 20% y la fecha de cierre', () => {
    const { container } = renderOffer()
    const text = container.textContent

    expect(text).toContain('Afiliación')
    expect(text).toContain('Inscripción')
    expect(text).toContain('Promoción ambas')
    expect(text).toContain('$\u00a075.000')
    expect(text).toContain('$\u00a0120.000')
    expect(text).toMatch(/20%\s+de descuento/)
    expect(text).toMatch(/viernes/i)
    expect(text).toMatch(/28/)
    expect(container.querySelector('.season-combo-offer__cta')).toBeTruthy()
  })

  it('no renderiza si el combo no descuenta', () => {
    const { container } = renderOffer({ comboPrice: 150000 })
    expect(container.querySelector('.season-combo-offer')).toBeNull()
  })

  it('dispara el CTA del combo', () => {
    const onCta = vi.fn()
    const { container } = renderOffer({ onCta })
    fireEvent.click(container.querySelector('.season-combo-offer__cta'))
    expect(onCta).toHaveBeenCalledTimes(1)
  })
})
