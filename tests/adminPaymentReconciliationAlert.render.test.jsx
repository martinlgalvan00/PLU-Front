import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminPaymentReconciliationAlert from '../src/components/admin/AdminPaymentReconciliationAlert.jsx'

afterEach(cleanup)

const ENTRY = {
  id: 'payment-1',
  athleteId: 'athlete-1',
  athlete: { fullName: 'Agustín Díaz' },
  amount: 85000,
  conceptType: 'membership',
  reference: 'PLU-2026-001',
  missingMembership: true,
  missingRegistration: false,
}

describe('alerta operativa de conciliación', () => {
  it('no ocupa espacio cuando no hay casos', () => {
    const { container } = render(<AdminPaymentReconciliationAlert />)
    expect(container.firstChild).toBeNull()
  })

  it('es un ícono con el contador y el detalle se abre al tocarlo', () => {
    const onSelectAthlete = vi.fn()
    render(
      <AdminPaymentReconciliationAlert
        entries={[ENTRY]}
        onSelectAthlete={onSelectAthlete}
      />,
    )

    // Cerrado: solo el botón, sin el bloque de texto ni la lista.
    const trigger = screen.getByRole('button', { name: 'Pago cobrado sin derecho activado' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/Mercado Pago confirmó el cobro/)).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Pago cobrado sin derecho activado' })).toBeTruthy()
    expect(screen.getByText(/Mercado Pago confirmó el cobro/)).toBeTruthy()
    expect(screen.queryByText(/Suele pasar cuando/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Revisar atleta' }))
    expect(onSelectAthlete).toHaveBeenCalledWith('athlete-1')
  })

  it('cuenta los casos y se cierra con Escape devolviendo el foco', () => {
    render(<AdminPaymentReconciliationAlert entries={[ENTRY, { ...ENTRY, id: 'payment-2' }]} />)

    const trigger = screen.getByRole('button', { name: '2 pagos cobrados sin derechos activados' })
    expect(trigger.textContent).toContain('2')

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
