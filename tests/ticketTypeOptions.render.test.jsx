import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import TicketTypeOptions from '../src/components/ui/TicketTypeOptions.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import { ticketPricingFromEvent } from '../src/lib/eventPricing.js'

/**
 * Se arma desde `ticketPricingFromEvent` a propósito: lo que se prueba no es el
 * componente contra props inventadas, sino la cadena entera desde la forma en
 * que el evento trae sus tipos hasta lo que lee el comprador.
 */
const EVENT = {
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

function Chooser({ readOnly = false }) {
  const { locale, t } = useI18n()
  const [value, setValue] = useState('tt-espectador')
  const { ticketTypes } = ticketPricingFromEvent(EVENT)

  return (
    <>
      <TicketTypeOptions
        locale={locale}
        name="ticket-type"
        onChange={readOnly ? undefined : setValue}
        t={t}
        ticketTypes={ticketTypes}
        value={value}
      />
      <output data-testid="value">{value}</output>
    </>
  )
}

function renderChooser(props = {}) {
  return render(
    <I18nProvider>
      <Chooser {...props} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('TicketTypeOptions', () => {
  /**
   * El chip anterior mostraba sólo el nombre: dos entradas con accesos
   * distintos se leían iguales.
   */
  it('dice qué zona abre cada tipo', () => {
    renderChooser()

    const entrenador = screen.getByRole('radio', { name: /Entrenador/ })
    expect(entrenador.closest('label').textContent).toContain('Puerta general')
    expect(entrenador.closest('label').textContent).toContain('Entrada en calor')

    const espectador = screen.getByRole('radio', { name: /^Espectador/ })
    expect(espectador.closest('label').textContent).toContain('Puerta general')
    expect(espectador.closest('label').textContent).not.toContain('Entrada en calor')
  })

  /**
   * "Cupo 20" con dos credenciales son 20 lugares y 40 QR. Decir sólo uno de
   * los dos números es lo que confunde.
   */
  it('cuenta las credenciales y aclara que el cupo no se duplica', () => {
    renderChooser()

    const entrenador = screen.getByRole('radio', { name: /Entrenador/ }).closest('label')
    expect(entrenador.textContent).toContain('2 credenciales · 2 QR')
    expect(entrenador.textContent).toContain('Ocupa un solo lugar del cupo')

    const espectador = screen.getByRole('radio', { name: /^Espectador/ }).closest('label')
    expect(espectador.textContent).toContain('1 credencial · 1 QR')
    expect(espectador.textContent).not.toContain('Ocupa un solo lugar del cupo')
  })

  it('elegir una opción cambia el tipo seleccionado', () => {
    renderChooser()

    fireEvent.click(screen.getByRole('radio', { name: /Entrenador/ }))

    expect(screen.getByTestId('value').textContent).toBe('tt-entrenador')
    expect(screen.getByRole('radio', { name: /Entrenador/ }).checked).toBe(true)
  })

  /** El radio sigue en el DOM: es lo que da foco y teclado. */
  it('expone un grupo de radios navegable, no botones', () => {
    renderChooser()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  /** Sin `onChange` no se ofrece un control que no hace nada. */
  it('en modo lectura no dibuja controles', () => {
    renderChooser({ readOnly: true })

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByRole('list', { name: 'Tipo de entrada' }).textContent).toContain(
      'Entrada en calor',
    )
  })
})
