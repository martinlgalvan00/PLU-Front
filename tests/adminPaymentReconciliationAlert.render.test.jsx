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

  it('resume el problema y abre la ficha del atleta', () => {
    const onSelectAthlete = vi.fn()
    render(
      <AdminPaymentReconciliationAlert
        entries={[ENTRY]}
        onSelectAthlete={onSelectAthlete}
      />,
    )

    expect(screen.getByText('Pago cobrado sin derecho activado')).toBeTruthy()
    expect(screen.getByText(/Mercado Pago confirmó el cobro/)).toBeTruthy()
    expect(screen.queryByText(/Suele pasar cuando/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Revisar atleta' }))
    expect(onSelectAthlete).toHaveBeenCalledWith('athlete-1')
  })
})
