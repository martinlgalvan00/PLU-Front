import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MembershipCard from '../src/components/ui/MembershipCard.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

describe('MembershipCard PLU', () => {
  it('ordena título, precio e includes sin kicker anual ni índices', () => {
    const { container } = render(
      <I18nProvider>
        <MembershipCard
          variant="plu"
          highlighted
          title="Afiliación PLU anual"
          kicker="Anual"
          price={75000}
          features={['Mayores de 18 años', 'Credencial digital']}
          onSelect={() => {}}
        />
      </I18nProvider>,
    )

    expect(container.querySelector('.membership-card--plu-band')).not.toBeNull()
    expect(container.querySelector('.membership-card__kicker')).toBeNull()
    expect(container.querySelector('.membership-card__price-line')).not.toBeNull()
    expect(container.querySelector('.membership-card__includes-label')?.textContent).toBe('Incluye')
    expect(container.querySelector('.membership-card__feature-index')).toBeNull()

    const bodyText = container.querySelector('.membership-card__body')?.textContent ?? ''
    const titleAt = bodyText.indexOf('Afiliación PLU anual')
    const priceAt = bodyText.indexOf('75.000')
    const featureAt = bodyText.indexOf('Mayores de 18 años')
    expect(titleAt).toBeGreaterThanOrEqual(0)
    expect(priceAt).toBeGreaterThan(titleAt)
    expect(featureAt).toBeGreaterThan(priceAt)
  })

  it('muestra un kicker que no replica el período', () => {
    const { container } = render(
      <I18nProvider>
        <MembershipCard
          variant="plu"
          highlighted
          title="Afiliación + Pitbull Classic"
          kicker="Hasta el 28 ago"
          price={120000}
          features={['Un solo pago']}
          onSelect={() => {}}
        />
      </I18nProvider>,
    )

    expect(container.querySelector('.membership-card__kicker')?.textContent).toBe('Hasta el 28 ago')
  })
})
