import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventRegistrationsPanel from '../src/components/admin/AdminEventRegistrationsPanel.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/lib/adminToast.js', () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

const EVENT = { id: 'evt-a', slug: 'torneo-a-2026', title: 'Torneo A' }

const REGISTRATIONS = [
  {
    id: 'reg-1',
    eventSlug: 'torneo-a-2026',
    status: 'pendiente_pago',
    category: '83',
    division: 'Open',
    athlete: { id: 'ath-1', fullName: 'Ana Atleta', documentId: '30111222' },
  },
  {
    id: 'reg-other',
    eventSlug: 'otro-2026',
    status: 'confirmada',
    athlete: { id: 'ath-2', fullName: 'Otro' },
  },
]

afterEach(() => cleanup())

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <AdminEventRegistrationsPanel event={EVENT} registrations={REGISTRATIONS} {...props} />
    </I18nProvider>,
  )
}

describe('AdminEventRegistrationsPanel', () => {
  it('lista solo inscripciones del meet y no ofrece edición sin permiso', () => {
    renderPanel()
    expect(screen.getByText('Ana Atleta')).toBeTruthy()
    expect(screen.queryByText('Otro')).toBeNull()
    expect(screen.queryByRole('button', { name: /corregir estado/i })).toBeNull()
  })

  it('con permiso abre el diálogo y confirma el nuevo estado', async () => {
    const onSetRegistrationStatus = vi.fn().mockResolvedValue({ registration: { id: 'reg-1' } })
    renderPanel({ canSetStatus: true, onSetRegistrationStatus })

    fireEvent.click(screen.getByRole('button', { name: /corregir estado/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toMatch(/Ana Atleta/)
    expect(dialog.textContent).toMatch(/Torneo A/)

    fireEvent.click(screen.getByRole('radio', { name: /confirmada/i }))
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), {
      target: { value: 'Pago acreditado en caja' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }))

    await waitFor(() => {
      expect(onSetRegistrationStatus).toHaveBeenCalledWith(
        'reg-1',
        'confirmada',
        'Pago acreditado en caja',
      )
    })
  })
})
