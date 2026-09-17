import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import AdminTicketTypesEditor from '../src/components/admin/AdminTicketTypesEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => cleanup())

function Harness() {
  const [days, setDays] = useState([
    { dayIndex: 0, label: 'Día 1', date: '2026-08-15' },
    { dayIndex: 1, label: 'Día 2', date: '2026-08-16' },
    { dayIndex: 2, label: 'Día 3', date: '2026-08-17' },
  ])
  const [types, setTypes] = useState([
    { name: 'Pase días 2 y 3', price: 1000, dayIndexes: [1, 2], includedAddonIds: [] },
  ])

  return (
    <I18nProvider>
      <AdminTicketTypesEditor
        canEdit
        allowEditDays
        eventDays={days}
        onChangeEventDays={setDays}
        onChangeTicketTypes={setTypes}
        ticketTypes={types}
      />
      <output data-testid="state">{JSON.stringify({ days, types })}</output>
    </I18nProvider>
  )
}

function CatalogHarness({ addonsCatalog = [], errors } = {}) {
  const [types, setTypes] = useState([
    {
      name: 'Público general',
      description: 'Acceso válido durante la jornada inaugural.',
      price: 15000,
      dayIndexes: [0],
      includedAddonIds: [],
      credentials: [{ label: 'Entrada general', zoneScopes: ['gate_tickets'] }],
    },
    {
      name: 'Palco',
      price: 40000,
      quota: 20,
      active: false,
      dayIndexes: [0],
      includedAddonIds: [],
      credentials: [{ label: 'Palco VIP', zoneScopes: ['gate_tickets'] }],
    },
  ])

  return (
    <I18nProvider>
      <AdminTicketTypesEditor
        addonsCatalog={addonsCatalog}
        canEdit
        errors={errors}
        eventDays={[{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }]}
        onChangeTicketTypes={setTypes}
        ticketTypes={types}
      />
      <div data-testid="catalog-state">{JSON.stringify(types)}</div>
    </I18nProvider>
  )
}

describe('AdminTicketTypesEditor', () => {
  it('renumera también las referencias al borrar una jornada intermedia', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /quitar d.a 2/i }))
    const state = JSON.parse(screen.getByTestId('state').textContent)

    expect(state.days.map((day) => day.dayIndex)).toEqual([0, 1])
    expect(state.types[0].dayIndexes).toEqual([1])
  })

  it('lista los tipos en una tabla y edita un solo detalle a la vez', () => {
    render(<CatalogHarness />)

    const general = document.getElementById('ticket-type-row-0')
    const palco = document.getElementById('ticket-type-row-1')

    expect(general.getAttribute('aria-selected')).toBe('true')
    expect(palco.getAttribute('aria-selected')).toBe('false')
    expect(general.textContent).toMatch(/15.?000/)
    expect(general.textContent).toMatch(/=\s*MP/)
    expect(general.textContent).toMatch(/qr:.*día 1/i)
    expect(screen.getByDisplayValue('Público general')).toBeTruthy()
    expect(screen.getByDisplayValue('Acceso válido durante la jornada inaugural.')).toBeTruthy()
    expect(screen.getAllByRole('spinbutton', { name: /precio wise/i })).toHaveLength(1)
    expect(screen.queryByDisplayValue('Palco')).toBeNull()
    expect(screen.getByText(/emite 1 QR de espectador/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /personalizar/i }))
    expect(screen.getByDisplayValue('Entrada general')).toBeTruthy()
    expect(screen.queryByDisplayValue('Palco VIP')).toBeNull()

    fireEvent.click(palco)

    expect(palco.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('Palco')).toBeTruthy()
    expect(screen.queryByDisplayValue('Público general')).toBeNull()
    expect(screen.getByDisplayValue('Palco VIP')).toBeTruthy()
  })

  it('permite personalizar la descripción y explicita la vigencia por jornada', () => {
    render(<CatalogHarness />)

    const description = screen.getByRole('textbox', { name: /descripción/i })
    fireEvent.change(description, { target: { value: 'Incluye tribuna y sector gastronómico.' } })

    expect(description.value).toBe('Incluye tribuna y sector gastronómico.')
    expect(screen.getAllByText(/qr:.*día 1/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/el qr de esta entrada vale el día 1/i)).toBeTruthy()
  })

  it('configura la duración desde pago en el tipo, sin crear otro QR', () => {
    render(<CatalogHarness />)

    fireEvent.click(screen.getByRole('radio', { name: /desde que se acredita el pago/i }))

    const duration = screen.getByRole('spinbutton', { name: /duración/i })
    expect(duration.value).toBe('12')
    expect(screen.getByRole('combobox', { name: /unidad de duración/i }).value).toBe('hours')

    fireEvent.change(screen.getByRole('combobox', { name: /unidad de duración/i }), {
      target: { value: 'days' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: /duración/i }), {
      target: { value: '2' },
    })

    expect(screen.getByRole('spinbutton', { name: /duración/i }).value).toBe('2')
    expect(JSON.parse(screen.getByTestId('catalog-state').textContent)[0]).toMatchObject({
      validityMode: 'from_payment',
      validityDurationMinutes: 2 * 24 * 60,
    })
  })

  it('configura la duración desde el primer escaneo', () => {
    render(<CatalogHarness />)

    fireEvent.click(screen.getByRole('radio', { name: /desde el primer escaneo/i }))

    expect(screen.getByRole('spinbutton', { name: /duración/i }).value).toBe('12')
    expect(screen.getByText(/el reloj arranca cuando seguridad lo lee/i)).toBeTruthy()
    expect(JSON.parse(screen.getByTestId('catalog-state').textContent)[0]).toMatchObject({
      validityMode: 'from_first_scan',
      validityDurationMinutes: 12 * 60,
    })
  })

  it('permite que una única credencial ingrese una vez por cada jornada', () => {
    render(<CatalogHarness />)

    fireEvent.click(screen.getByRole('radio', { name: /un ingreso por cada jornada/i }))

    expect(JSON.parse(screen.getByTestId('catalog-state').textContent)[0]).toMatchObject({
      accessUsageMode: 'once_per_event_day',
    })
    expect(screen.getByText(/no se generan qr por fecha/i)).toBeTruthy()
  })

  it('abre el tipo con error de validación', () => {
    render(<CatalogHarness errors={{ 'ticketTypes.1.name': 'Poné un nombre.' }} />)

    expect(document.getElementById('ticket-type-row-1').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('Palco')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Poné un nombre.')
  })

  it('edita el precio manual (transferencia/efectivo) junto al de Mercado Pago', () => {
    render(<CatalogHarness />)

    const manualPriceInput = screen.getByRole('spinbutton', { name: /transferencia/i })
    expect(manualPriceInput.value).toBe('')

    fireEvent.change(manualPriceInput, { target: { value: '13000' } })

    expect(screen.getByRole('spinbutton', { name: /transferencia/i }).value).toBe('13000')
    expect(document.getElementById('ticket-type-row-0').textContent).toMatch(/13.?000/)
  })

  it('editar Wise actualiza la fila del catálogo', () => {
    render(<CatalogHarness />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /precio wise/i }), {
      target: { value: '15' },
    })

    expect(screen.getByRole('spinbutton', { name: /precio wise/i }).value).toBe('15')
    expect(document.getElementById('ticket-type-row-0').textContent).toMatch(/15/)
  })

  it('avisa cuando hay beneficios pagos sin USD y Wise del tipo no va a aplicarse', () => {
    render(
      <CatalogHarness
        addonsCatalog={[{ id: 'chori', label: 'Choripán', price: 5000, enabled: true }]}
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/beneficios pagos sin USD/i)
  })

  it('muestra el error de validación del precio manual en su propio campo', () => {
    render(
      <CatalogHarness errors={{ 'ticketTypes.0.manualPrice': 'Supera el precio de lista.' }} />,
    )

    expect(screen.getByRole('alert').textContent).toBe('Supera el precio de lista.')
  })

  it('hereda los medios del evento y sólo muestra el picker al restringir', () => {
    render(<CatalogHarness />)

    expect(screen.getByText(/se cobra con los medios del evento/i)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /mercado pago/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /restringir esta/i }))

    expect(screen.getByRole('checkbox', { name: /mercado pago/i })).toBeTruthy()
    expect(screen.getByText(/sólo esta entrada/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /usar los del evento/i }))

    expect(screen.queryByRole('checkbox', { name: /mercado pago/i })).toBeNull()
    expect(screen.getByText(/se cobra con los medios del evento/i)).toBeTruthy()
  })
})
