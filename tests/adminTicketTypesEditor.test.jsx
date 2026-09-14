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

function CatalogHarness({ errors } = {}) {
  const [types, setTypes] = useState([
    {
      name: 'Público general',
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
        canEdit
        errors={errors}
        eventDays={[{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }]}
        onChangeTicketTypes={setTypes}
        ticketTypes={types}
      />
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
    expect(screen.getByDisplayValue('Público general')).toBeTruthy()
    expect(screen.getAllByRole('spinbutton', { name: /precio wise/i })).toHaveLength(1)
    expect(screen.queryByDisplayValue('Palco')).toBeNull()
    expect(screen.getByDisplayValue('Entrada general')).toBeTruthy()
    expect(screen.queryByDisplayValue('Palco VIP')).toBeNull()

    fireEvent.click(palco)

    expect(palco.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('Palco')).toBeTruthy()
    expect(screen.queryByDisplayValue('Público general')).toBeNull()
    expect(screen.getByDisplayValue('Palco VIP')).toBeTruthy()
  })

  it('abre el tipo con error de validación', () => {
    render(<CatalogHarness errors={{ 'ticketTypes.1.name': 'Poné un nombre.' }} />)

    expect(document.getElementById('ticket-type-row-1').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('Palco')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Poné un nombre.')
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
