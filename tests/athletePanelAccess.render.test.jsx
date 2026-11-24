import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AthleteDetailSection from '../src/pages/admin/AthleteDetailSection.jsx'

/**
 * Un atleta (identidad de Supabase) puede recibir una cuenta del panel
 * (identidad de Prisma) desde su ficha. Lo único que las une es el email: no
 * se toca la cuenta de atleta, se crea la del panel con el mismo mail y la
 * persona la activa desde un enlace.
 */

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
})

afterEach(cleanup)

const athlete = {
  id: 'a1',
  fullName: 'Gonzalo Taraborrelli',
  documentId: '36764369',
  email: 'Gonzatataborrelli@Gmail.com',
  gym: 'Pitbull Barbell Club',
  status: 'registrado',
}

const accessRoles = [
  { key: 'admin_maximal', name: 'Super Admin', canAssign: true, active: true, hierarchyLevel: 1 },
  { key: 'admin_plu_arg', name: 'Administrador', canAssign: true, active: true, hierarchyLevel: 2 },
  {
    key: 'plu_arg',
    name: 'PLU ARG',
    canAssign: true,
    active: true,
    hierarchyLevel: 3,
    description: 'Operación de eventos y atletas.',
  },
  { key: 'seguridad_plu_arg', name: 'Seguridad', canAssign: true, active: true, hierarchyLevel: 5 },
  { key: 'solo_lectura', name: 'Retirado', canAssign: false, active: true, hierarchyLevel: 4 },
]

function renderDetail(props = {}) {
  return render(
    <I18nProvider>
      <AthleteDetailSection
        accessRoles={accessRoles}
        canGrantAccess
        detail={{ athlete, memberships: [], registrations: [], payments: [] }}
        onBack={() => {}}
        onCreateUser={vi.fn()}
        users={[]}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('Acceso al panel desde la ficha del atleta', () => {
  it('ofrece sólo roles asignables, sin Seguridad, con PLU ARG por defecto', () => {
    renderDetail()

    const select = screen.getByLabelText('Rol')
    expect(select.value).toBe('plu_arg')
    const labels = [...select.querySelectorAll('option')].map((option) => option.textContent)
    expect(labels).toEqual(['Super Admin', 'Administrador', 'PLU ARG'])
    expect(screen.getByText('Operación de eventos y atletas.')).toBeTruthy()
  })

  it('crea la cuenta con el email del atleta y muestra el enlace de activación', async () => {
    const onCreateUser = vi.fn().mockResolvedValue({
      user: { name: athlete.fullName, email: 'gonzatataborrelli@gmail.com' },
      emailed: true,
      invitationUrl: 'https://pluarg.example/invitacion?token=abc',
      invitationExpiresAt: '2026-10-20T12:00:00.000Z',
    })
    renderDetail({ onCreateUser })

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'admin_plu_arg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dar acceso' }))

    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(1))
    expect(onCreateUser).toHaveBeenCalledWith({
      name: 'Gonzalo Taraborrelli',
      email: 'gonzatataborrelli@gmail.com',
      role: 'admin_plu_arg',
      sendEmail: true,
    })
    const link = await screen.findByLabelText('Enlace de activación')
    expect(link.value).toBe('https://pluarg.example/invitacion?token=abc')
  })

  it('conserva el enlace aunque la cuenta ya aparezca en la lista de usuarios', async () => {
    const onCreateUser = vi.fn().mockResolvedValue({
      user: { name: athlete.fullName, email: 'gonzatataborrelli@gmail.com' },
      emailed: false,
      invitationUrl: 'https://pluarg.example/invitacion?token=abc',
      invitationExpiresAt: null,
    })
    const view = renderDetail({ onCreateUser })

    fireEvent.click(screen.getByRole('button', { name: 'Dar acceso' }))
    await screen.findByLabelText('Enlace de activación')

    // El padre agrega la cuenta nueva a `users`: el aviso no puede desaparecer.
    view.rerender(
      <I18nProvider>
        <AthleteDetailSection
          accessRoles={accessRoles}
          canGrantAccess
          detail={{ athlete, memberships: [], registrations: [], payments: [] }}
          onBack={() => {}}
          onCreateUser={onCreateUser}
          users={[
            {
              id: 'u1',
              email: 'gonzatataborrelli@gmail.com',
              roleKey: 'plu_arg',
              status: 'invited',
            },
          ]}
        />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('Enlace de activación')).toBeTruthy()
  })

  it('si ya tiene cuenta del panel, muestra su rol y estado en vez del formulario', () => {
    const onOpenUsers = vi.fn()
    renderDetail({
      onOpenUsers,
      users: [
        {
          id: 'u1',
          email: 'GONZATATABORRELLI@gmail.com',
          roleKey: 'admin_plu_arg',
          roleLabel: 'Administrador',
          status: 'invited',
        },
      ],
    })

    expect(screen.queryByRole('button', { name: 'Dar acceso' })).toBeNull()
    expect(screen.getByText('Administrador')).toBeTruthy()
    expect(screen.getByText('Invitado')).toBeTruthy()
    expect(screen.getByText(/invitación pendiente/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ver en Usuarios' }))
    expect(onOpenUsers).toHaveBeenCalledTimes(1)
  })

  it('informa el conflicto cuando el servidor responde 409', async () => {
    const onCreateUser = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 409 }))
    renderDetail({ onCreateUser })

    fireEvent.click(screen.getByRole('button', { name: 'Dar acceso' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya existe una cuenta del panel con ese email.',
    )
    // El formulario queda disponible para reintentar.
    expect(screen.getByRole('button', { name: 'Dar acceso' })).toBeTruthy()
  })

  it('no aparece sin permiso para administrar usuarios', () => {
    renderDetail({ canGrantAccess: false })

    expect(screen.queryByText('Acceso al panel')).toBeNull()
  })

  it('avisa que no se puede dar acceso a un atleta sin email', () => {
    renderDetail({
      detail: {
        athlete: { ...athlete, email: '' },
        memberships: [],
        registrations: [],
        payments: [],
      },
    })

    expect(screen.queryByRole('button', { name: 'Dar acceso' })).toBeNull()
    expect(screen.getByText(/no tiene email cargado/i)).toBeTruthy()
  })
})
