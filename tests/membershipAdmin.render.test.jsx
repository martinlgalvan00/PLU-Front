import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MembershipsSection from '../src/pages/admin/MembershipsSection.jsx'

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      membershipValidationEnabled: true,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })),
  }
})

const { fetchPlatformFeatureToggles } = await import('../src/services/platformSettingsAdminService.js')

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => {
  cleanup()
  vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue({
    membershipValidationEnabled: true,
    registrationValidationEnabled: true,
    ticketValidationEnabled: true,
  })
})

function membership(overrides = {}) {
  return {
    id: 'mem-1',
    athleteId: 'ath-1',
    athlete: { fullName: 'Ana Torres', documentId: '30111222' },
    memberCode: 'PLU-ARG-2026-014',
    year: '2026',
    status: 'activa',
    startDate: '2026-01-01',
    expirationDate: `${new Date().getFullYear() + 1}-12-31`,
    ...overrides,
  }
}

function renderSection(items, props = {}) {
  return render(
    <I18nProvider>
      <MembershipsSection memberships={items} canManage {...props} />
    </I18nProvider>,
  )
}

describe('operación de afiliaciones', () => {
  it('muestra como vencida una fila activa con fecha pasada y no expone su credencial', () => {
    renderSection([membership({ expirationDate: '2020-12-31' })])

    expect(screen.getAllByText('Vencida').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Credencial' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).toBeNull()
  })

  it('pide confirmación antes de dar de baja y ejecuta una sola transición', async () => {
    const onSetMembershipStatus = vi.fn(async () => ({ membership: membership({ status: 'cancelada' }) }))
    renderSection([membership()], { onSetMembershipStatus })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja' })[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onSetMembershipStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }))
    await waitFor(() => expect(onSetMembershipStatus).toHaveBeenCalledTimes(1))
    expect(onSetMembershipStatus).toHaveBeenCalledWith('mem-1', 'cancelada')
  })

  it('recupera los controles si la transición rechaza', async () => {
    const onSetMembershipStatus = vi.fn(async () => {
      throw new Error('Servicio temporalmente no disponible')
    })
    renderSection([membership()], { onSetMembershipStatus })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((node) =>
        node.textContent.includes('Servicio temporalmente no disponible'),
      )).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'Confirmar baja' }).disabled).toBe(false)
  })

  it('no deja activar a mano si la validación está pausada desde el panel', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValueOnce({
      membershipValidationEnabled: false,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })
    const onSetMembershipStatus = vi.fn()
    renderSection(
      [membership({ status: 'pendiente_pago', expirationDate: `${new Date().getFullYear() + 1}-12-31` })],
      { onSetMembershipStatus },
    )

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/pausada desde Acceso y habilitación/)
    })
    const activate = screen.getAllByRole('button', {
      name: 'La validación de afiliaciones está pausada desde Acceso y habilitación.',
    })[0]
    expect(activate.disabled).toBe(true)
    fireEvent.click(activate)
    expect(onSetMembershipStatus).not.toHaveBeenCalled()
  })
})
