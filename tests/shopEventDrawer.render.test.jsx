import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShopEventDrawer from '../src/components/ui/ShopEventDrawer.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'

// El drawer pide el cupo al store, que sale a la red. Acá no se prueba eso.
vi.mock('../src/hooks/useTicketAvailability.js', () => ({
  useTicketAvailability: () => null,
  useTicketCheckoutAvailability: () => ({ ticketEnabled: true, ticketManualEnabled: false }),
}))

const EVENT = {
  id: 'evt-1',
  slug: 'meet-de-prueba',
  title: 'Meet de prueba',
  date: '12–13 Dic',
  venue: 'La Troupe Multiespacio',
  status: 'inscripcion_abierta',
  pricing: { ticketsEnabled: true },
  ticketTypes: [
    {
      id: 'tt-espectador',
      name: 'Espectador',
      price: 20000,
      sortOrder: 0,
      credentials: [{ label: 'Entrada general', zoneScopes: ['gate_tickets'] }],
    },
    {
      id: 'tt-entrenador',
      name: 'Entrenador',
      price: 35000,
      sortOrder: 1,
      credentials: [
        { label: 'Espectador', zoneScopes: ['gate_tickets'] },
        { label: 'ENTRENADOR', zoneScopes: ['athletes_coaches'] },
      ],
    },
  ],
}

function Harness({ event = EVENT }) {
  const { locale, t } = useI18n()
  return (
    <ShopEventDrawer
      open
      checkoutOpen
      event={event}
      locale={locale}
      onBuyTickets={() => {}}
      onClose={() => {}}
      onViewEvent={() => {}}
      t={t}
    />
  )
}

function renderDrawer(props = {}) {
  return render(
    <I18nProvider>
      <Harness {...props} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('vista rápida de un evento en la Tienda', () => {
  /**
   * El drawer decía sólo "desde $X", que es lo único que dos entradas
   * distintas tienen en común. Es justo la pantalla que se abre para comparar.
   */
  it('nombra los tipos de entrada con su precio', () => {
    renderDrawer()

    const panel = screen.getByRole('dialog')
    expect(panel.textContent).toContain('Espectador')
    expect(panel.textContent).toContain('Entrenador')
    // El separador entre el signo y el número lo pone Intl y no siempre es un
    // espacio común: se afirma el importe, no cómo lo espacia el locale.
    expect(panel.textContent).toMatch(/\$\s*20\.000/)
    expect(panel.textContent).toMatch(/\$\s*35\.000/)
  })

  it('dice qué zona abre cada tipo', () => {
    renderDrawer()

    const options = screen.getByRole('list', { name: 'Tipo de entrada' })
    expect(options.textContent).toContain('Puerta general')
    expect(options.textContent).toContain('Entrada en calor')
  })

  it('avisa que la entrada de entrenador emite dos credenciales', () => {
    renderDrawer()

    const options = screen.getByRole('list', { name: 'Tipo de entrada' })
    expect(options.textContent).toContain('2 credenciales · 2 QR')
    expect(options.textContent).toContain('1 credencial · 1 QR')
  })

  /** Es una vidriera: elegir pasa en el checkout, no acá. */
  it('no ofrece controles de selección', () => {
    renderDrawer()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  /** Con la venta cerrada no se anuncia un acceso que no se puede comprar. */
  it('con la venta cerrada no lista tipos', () => {
    renderDrawer({ event: { ...EVENT, pricing: { ticketsEnabled: false } } })
    expect(screen.queryByRole('list', { name: 'Tipo de entrada' })).toBeNull()
  })
})
