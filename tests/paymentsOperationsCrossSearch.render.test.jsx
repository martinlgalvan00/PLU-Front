import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Cobros tiene un solo buscador a la vista (el de la cola). El buscador
 * cruzado —por persona o referencia, en todas las colas— es un acceso bajo
 * demanda: aparece al pedirlo y se cierra solo al elegir un resultado.
 */

vi.mock('../src/providers/AdminTourProvider.jsx', () => ({
  useAdminTour: () => ({ startTour: () => {} }),
}))
vi.mock('../src/services/platformSettingsAdminService.js', () => ({
  fetchPlatformFeatureToggles: vi.fn(async () => ({
    membershipValidationEnabled: true,
    registrationValidationEnabled: true,
    ticketValidationEnabled: true,
  })),
}))
vi.mock('../src/pages/admin/AthletePaymentOrdersSection.jsx', () => ({
  default: () => <div data-testid="athlete-queue" />,
}))
vi.mock('../src/pages/admin/TicketOrdersSection.jsx', () => ({
  default: () => <div data-testid="ticket-queue" />,
}))
vi.mock('../src/components/admin/PaymentExpiryPanel.jsx', () => ({
  default: () => <div data-testid="expiry-panel" />,
}))
vi.mock('../src/components/admin/PaymentOrderSearch.jsx', () => ({
  default: ({ onSelectResult }) => (
    <button
      type="button"
      data-testid="cross-search"
      onClick={() => onSelectResult({ kind: 'ticket', id: 't1', reference: 'TORD-1' })}
    >
      resultado
    </button>
  ),
}))

const PaymentsOperationsSection = (await import('../src/pages/admin/PaymentsOperationsSection.jsx'))
  .default

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  window.HTMLElement.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

function renderPayments() {
  return render(
    <I18nProvider>
      <PaymentsOperationsSection
        canEdit
        pendingTicketOrders={[]}
        ticketEvents={[]}
        onApprovePayment={async () => ({})}
        onRejectPayment={async () => ({})}
        onApproveTicketOrder={async () => ({})}
        onRejectTicketOrder={async () => ({})}
        onRefresh={async () => {}}
      />
    </I18nProvider>,
  )
}

describe('Cobros — buscador cruzado bajo demanda', () => {
  it('no muestra el buscador cruzado hasta que se pide', () => {
    renderPayments()

    expect(screen.queryByTestId('cross-search')).toBeNull()
    const toggle = screen.getByRole('button', { name: /buscar en todas las colas/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('se abre y se cierra desde el mismo acceso', () => {
    renderPayments()

    fireEvent.click(screen.getByRole('button', { name: /buscar en todas las colas/i }))
    expect(screen.getByTestId('cross-search')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /cerrar búsqueda/i }))
    expect(screen.queryByTestId('cross-search')).toBeNull()
  })

  it('al elegir un resultado se cierra y salta a la cola de entradas', () => {
    renderPayments()

    fireEvent.click(screen.getByRole('button', { name: /buscar en todas las colas/i }))
    fireEvent.click(screen.getByTestId('cross-search'))

    expect(screen.queryByTestId('cross-search')).toBeNull()
    expect(
      screen.getByRole('button', { name: /buscar en todas las colas/i }).getAttribute('aria-expanded'),
    ).toBe('false')
  })
})
