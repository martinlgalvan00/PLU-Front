import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminAthletesBulkBar from '../src/components/admin/AdminAthletesBulkBar.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

const PRESET =
  'Para inscribirte a un evento oficial, completá en tu cuenta los datos de contacto y de competencia.'

function renderBar(props) {
  const onNotifyIncomplete = props.onNotifyIncomplete ?? vi.fn(async (ids) => ({ sent: ids, skipped: [] }))
  return {
    onNotifyIncomplete,
    ...render(
      <I18nProvider>
        <AdminAthletesBulkBar
          selectedIds={props.selectedIds}
          onBulkUpdate={vi.fn()}
          onNotifyIncomplete={onNotifyIncomplete}
          notifyPreset={PRESET}
          incompleteSelectedCount={props.incompleteSelectedCount}
          completeSelectedCount={props.completeSelectedCount}
          notifyAthleteIds={props.notifyAthleteIds}
          notifyMissingFields={props.notifyMissingFields ?? 'Teléfono'}
          onClearSelection={vi.fn()}
        />
      </I18nProvider>,
    ),
  }
}

describe('AdminAthletesBulkBar avisos', () => {
  it('permite enviar más de 50 con preview y nota editable', async () => {
    const selectedIds = Array.from({ length: 201 }, (_, index) => `ath-${index}`)
    const notifyAthleteIds = selectedIds.slice(0, 180)
    const { onNotifyIncomplete } = renderBar({
      selectedIds,
      notifyAthleteIds,
      incompleteSelectedCount: 180,
      completeSelectedCount: 21,
    })

    fireEvent.click(screen.getByRole('button', { name: /avisar perfil incompleto/i }))

    expect(screen.getByRole('button', { name: 'Enviar aviso' }).disabled).toBe(false)
    expect(screen.getByText(/Se va a notificar a 180 perfiles incompletos/)).toBeTruthy()
    expect(screen.getByText(/21 completos se omiten/)).toBeTruthy()
    expect(screen.getByText(/Se envía en 4 lotes de hasta 50/)).toBeTruthy()
    expect(screen.getByText('Datos pendientes')).toBeTruthy()
    expect(screen.getByText(/No se manda email/)).toBeTruthy()

    const note = screen.getByPlaceholderText('Mensaje que va a ver en la campana de su cuenta.')
    fireEvent.change(note, { target: { value: 'Falta el teléfono para inscribirte.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar aviso' }))

    expect(onNotifyIncomplete).toHaveBeenCalledWith(
      notifyAthleteIds,
      'Falta el teléfono para inscribirte.',
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  it('no envía si no hay perfiles incompletos', () => {
    const { onNotifyIncomplete } = renderBar({
      selectedIds: ['ath-1', 'ath-2'],
      incompleteSelectedCount: 0,
      completeSelectedCount: 2,
    })

    fireEvent.click(screen.getByRole('button', { name: /avisar perfil incompleto/i }))
    expect(screen.getByRole('button', { name: 'Enviar aviso' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar aviso' }))
    expect(onNotifyIncomplete).not.toHaveBeenCalled()
  })
})
