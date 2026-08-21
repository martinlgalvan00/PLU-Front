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

  /** Escribe el motivo en el diálogo abierto. Sin esto no se puede confirmar. */
  function fillReason(text = 'Transferencia recibida el 20/08.') {
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: text } })
  }

  it('pide confirmación y motivo antes de dar de baja, y ejecuta una sola transición', async () => {
    const onSetMembershipStatus = vi.fn(async () => ({ membership: membership({ status: 'cancelada' }) }))
    renderSection([membership()], { onSetMembershipStatus })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja' })[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onSetMembershipStatus).not.toHaveBeenCalled()

    // El motivo es obligatorio: sin él el botón no habilita. Es la regla que
    // faltaba y que dejó tres afiliaciones activas sin explicación en la base.
    expect(screen.getByRole('button', { name: 'Confirmar baja' }).disabled).toBe(true)

    fillReason('Se dio de baja por pedido del atleta.')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }))

    await waitFor(() => expect(onSetMembershipStatus).toHaveBeenCalledTimes(1))
    expect(onSetMembershipStatus).toHaveBeenCalledWith('mem-1', 'cancelada', {
      reason: 'Se dio de baja por pedido del atleta.',
      channel: null,
    })
  })

  it('exige canal y motivo para activar a mano, y los manda al backend', async () => {
    const onSetMembershipStatus = vi.fn(async () => ({ membership: membership() }))
    renderSection([membership({ status: 'pendiente_pago' })], { onSetMembershipStatus })

    fireEvent.click(screen.getAllByRole('button', { name: 'Activar' })[0])

    const confirm = () => screen.getByRole('button', { name: 'Activar y registrar el motivo' })
    expect(confirm().disabled).toBe(true)

    // Con motivo pero sin canal sigue bloqueado: activar a mano atribuye plata
    // que entró por fuera, y Finanzas necesita saber por dónde entró.
    fillReason('Pagó por transferencia, comprobante en el grupo.')
    expect(confirm().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('¿Por dónde se resolvió?'), {
      target: { value: 'bank_transfer' },
    })
    expect(confirm().disabled).toBe(false)

    fireEvent.click(confirm())
    await waitFor(() => expect(onSetMembershipStatus).toHaveBeenCalledTimes(1))
    expect(onSetMembershipStatus).toHaveBeenCalledWith('mem-1', 'activa', {
      reason: 'Pagó por transferencia, comprobante en el grupo.',
      channel: 'bank_transfer',
    })
  })

  it('avisa que la orden de Mercado Pago no se acredita al activar a mano', () => {
    renderSection([membership({ status: 'pendiente_pago' })], {
      onSetMembershipStatus: vi.fn(),
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Activar' })[0])

    // Marcar la orden como aprobada falsearía los ingresos: el diálogo lo dice
    // para que nadie espere ver el pago en verde ni intente "arreglarlo".
    expect(screen.getByRole('dialog').textContent).toContain(
      'La orden de Mercado Pago queda cancelada',
    )
  })

  it('recupera los controles si la transición rechaza', async () => {
    const onSetMembershipStatus = vi.fn(async () => {
      throw new Error('Servicio temporalmente no disponible')
    })
    renderSection([membership()], { onSetMembershipStatus })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja' })[0])
    fillReason()
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
