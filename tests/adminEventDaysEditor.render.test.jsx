import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventDaysEditor from '../src/components/admin/AdminEventDaysEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => cleanup())

function renderDays(overrides = {}) {
  return render(
    <I18nProvider>
      <AdminEventDaysEditor
        canEdit
        eventDays={[{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }]}
        onChangeEventDays={() => {}}
        onChangeTicketTypes={() => {}}
        ticketTypes={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('AdminEventDaysEditor', () => {
  it('no borra un día trabado por tandas o atletas', () => {
    const onChangeEventDays = vi.fn()
    renderDays({
      lockedDayIndexes: new Set([0]),
      onChangeEventDays,
    })

    fireEvent.click(screen.getByRole('button', { name: /tandas o atletas/i }))
    expect(onChangeEventDays).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /tandas o atletas/i }).disabled).toBe(true)
  })

  it('borra un día libre', () => {
    const onChangeEventDays = vi.fn()
    renderDays({ onChangeEventDays })

    fireEvent.click(screen.getByRole('button', { name: /quitar día 1/i }))
    expect(onChangeEventDays).toHaveBeenCalledWith([])
  })
})
