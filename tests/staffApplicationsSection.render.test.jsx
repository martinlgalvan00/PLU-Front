import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/staffApplicationService.js', () => ({
  listStaffApplications: vi.fn(async () => [
    {
      id: 'app-1',
      first_name: 'Pablo',
      last_name: 'Asorey',
      document_id: '35275343',
      email: 'pablo@example.com',
      phone: '1155551234',
      staff_body: 'tecnico',
      technical_training_status: 'en_curso',
      shirt_size: 'M',
      status: 'pendiente',
      created_at: '2026-11-30T10:00:00.000Z',
      review_notes: null,
    },
  ]),
  reviewStaffApplication: vi.fn(async (_id, { status, notes }) => ({
    id: 'app-1',
    status,
    review_notes: notes || null,
  })),
}))

const StaffApplicationsSection = (
  await import('../src/pages/admin/StaffApplicationsSection.jsx')
).default
const { listStaffApplications, reviewStaffApplication } = await import(
  '../src/services/staffApplicationService.js'
)

afterEach(cleanup)

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <StaffApplicationsSection {...props} />
    </I18nProvider>,
  )
}

describe('StaffApplicationsSection', () => {
  it('lista las postulaciones pendientes con sus datos y un link de WhatsApp', async () => {
    renderSection({ canEdit: true })
    await waitFor(() => expect(listStaffApplications).toHaveBeenCalled())
    expect(await screen.findByText('Pablo Asorey')).toBeTruthy()
    expect(screen.getByText('PDCA en curso')).toBeTruthy()
    const whatsapp = screen.getByRole('link', { name: /whatsapp/i })
    expect(whatsapp.getAttribute('href')).toBe('https://wa.me/541155551234')
  })

  it('sin permiso de aprobar, no muestra las acciones de revisión', async () => {
    renderSection({ canEdit: false })
    await screen.findByText('Pablo Asorey')
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).toBeNull()
  })

  it('aprobar llama al servicio y sale de la lista de pendientes', async () => {
    renderSection({ canEdit: true })
    await screen.findByText('Pablo Asorey')
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    await waitFor(() =>
      expect(reviewStaffApplication).toHaveBeenCalledWith('app-1', {
        status: 'aprobada',
        notes: '',
      }),
    )
    await waitFor(() => expect(screen.queryByText('Pablo Asorey')).toBeNull())
  })

  it('rechazar pide confirmar con un motivo antes de enviar', async () => {
    renderSection({ canEdit: true })
    await screen.findByText('Pablo Asorey')
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }))
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(reviewStaffApplication).toHaveBeenCalledWith('app-1', {
        status: 'rechazada',
        notes: '',
      }),
    )
  })
})
