import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegistrationStatusDialog from '../src/components/admin/RegistrationStatusDialog.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

describe('Registro — corrección manual de estado', () => {
  it('habilita y envía el cambio al elegir un estado y escribir un motivo válido', () => {
    const onConfirm = vi.fn()
    render(
      <I18nProvider>
        <RegistrationStatusDialog
          registration={{
            athlete: 'Oscar Axel Ramos Tapia',
            event: 'Pitbull Classic',
            status: 'cancelada',
          }}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nProvider>,
    )

    const save = screen.getByRole('button', { name: 'Guardar estado' })
    expect(save.disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /observada/i }))
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), {
      target: { value: 'Pago revisado y habilitado por administración.' },
    })

    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(onConfirm).toHaveBeenCalledWith(
      'observada',
      'Pago revisado y habilitado por administración.',
      false,
    )
  })

  it('sólo ofrece avisar por mail cuando el nuevo estado es cancelada', () => {
    const onConfirm = vi.fn()
    render(
      <I18nProvider>
        <RegistrationStatusDialog
          registration={{
            athlete: 'Oscar Axel Ramos Tapia',
            event: 'Pitbull Classic',
            status: 'confirmada',
          }}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nProvider>,
    )

    expect(screen.queryByRole('checkbox', { name: /avisar por mail/i })).toBe(null)

    fireEvent.click(screen.getByRole('radio', { name: /cancelada/i }))
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), {
      target: { value: 'Cancelada por falta de pago dentro del plazo.' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /avisar por mail/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }))

    expect(onConfirm).toHaveBeenCalledWith(
      'cancelada',
      'Cancelada por falta de pago dentro del plazo.',
      true,
    )
  })
})
