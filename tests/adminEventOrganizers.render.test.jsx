import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventOrganizersSection from '../src/components/admin/AdminEventOrganizersSection.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const EVENT_ID = 'evt-1'

const USERS = [
  {
    id: 'u-olga',
    name: 'Olga Organizadora',
    email: 'olga@plu.test',
    roleKey: 'organizador_evento',
    eventScoped: true,
    eventAccess: [{ eventId: EVENT_ID, eventSlug: 'pitbull-classic-2026' }],
  },
  {
    id: 'u-omar',
    name: 'Omar Otro',
    email: 'omar@plu.test',
    roleKey: 'organizador_evento',
    eventScoped: true,
    eventAccess: [{ eventId: 'evt-other', eventSlug: 'otro-2026' }],
  },
]

afterEach(() => cleanup())

function renderSection(overrides = {}) {
  const props = {
    canManage: true,
    eventId: EVENT_ID,
    eventTitle: 'Pitbull Classic',
    onCreateOrganizer: vi.fn(async () => ({})),
    onSetEventAccess: vi.fn(async () => ({})),
    users: USERS,
    ...overrides,
  }
  render(
    <I18nProvider>
      <AdminEventOrganizersSection {...props} />
    </I18nProvider>,
  )
  return props
}

describe('organizadores del evento', () => {
  it('lista quién ya está autorizado en este meet', () => {
    renderSection()
    const list = screen.getByRole('list')
    expect(within(list).getByText(/olga organizadora/i)).toBeTruthy()
    expect(within(list).queryByText(/omar otro/i)).toBeNull()
    // Omar aparece en el selector de “sumar existente”, no en la lista autorizada.
    expect(screen.getByRole('option', { name: /omar otro/i })).toBeTruthy()
  })

  it('invita un organizador con este evento preasignado', async () => {
    const props = renderSection()
    fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: 'Nueva Org' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: 'nueva@plu.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /invitar a este evento/i }))
    await waitFor(() => {
      expect(props.onCreateOrganizer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nueva Org',
          email: 'nueva@plu.test',
          role: 'organizador_evento',
          eventIds: [EVENT_ID],
        }),
      )
    })
  })

  it('suma un organizador existente a este evento', async () => {
    const props = renderSection()
    fireEvent.change(screen.getByLabelText(/^organizador$/i), { target: { value: 'u-omar' } })
    fireEvent.click(screen.getByRole('button', { name: /autorizar en este evento/i }))
    await waitFor(() => {
      expect(props.onSetEventAccess).toHaveBeenCalledWith('u-omar', ['evt-other', EVENT_ID])
    })
  })

  it('no se muestra sin permiso de gestión', () => {
    const { container } = render(
      <I18nProvider>
        <AdminEventOrganizersSection
          canManage={false}
          eventId={EVENT_ID}
          eventTitle="Pitbull"
          onCreateOrganizer={vi.fn()}
          users={USERS}
        />
      </I18nProvider>,
    )
    expect(container.firstChild).toBeNull()
  })
})
