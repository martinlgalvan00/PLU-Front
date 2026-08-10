import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import AdminTicketTypesEditor from '../src/components/admin/AdminTicketTypesEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

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
        eventDays={days}
        onChangeEventDays={setDays}
        onChangeTicketTypes={setTypes}
        ticketTypes={types}
      />
      <output data-testid="state">{JSON.stringify({ days, types })}</output>
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
})
