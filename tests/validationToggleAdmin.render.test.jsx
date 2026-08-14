import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * El interruptor de validación tiene que verse en el panel antes de que el
 * operador haga clic: si no, la única señal es el 409 después de intentar
 * acreditar. Cubre las dos pantallas involucradas — la bandeja de Finanzas y la
 * de Acceso y habilitación, que es donde se prende y apaga.
 */
vi.mock('../src/services/athleteApi.js', () => ({
  listAthletePaymentOrders: vi.fn(),
  getAthletePaymentProofUrl: vi.fn(async () => 'https://example.test/proof.pdf'),
}))

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchPlatformFeatureToggles: vi.fn(), savePlatformFeatureToggle: vi.fn() }
})

const { listAthletePaymentOrders } = await import('../src/services/athleteApi.js')
const { fetchPlatformFeatureToggles, PLATFORM_TOGGLE_KEYS } = await import(
  '../src/services/platformSettingsAdminService.js'
)
const AthletePaymentOrdersSection = (
  await import('../src/pages/admin/AthletePaymentOrdersSection.jsx')
).default
const RegistrationAccessSection = (
  await import('../src/pages/admin/RegistrationAccessSection.jsx')
).default

afterEach(cleanup)

function order(overrides = {}) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    concept: 'membership',
    conceptLabel: 'Afiliación anual',
    amount: 75000,
    currency: 'ARS',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    status: 'validacion_manual',
    reference: 'MORD-test',
    createdAt: '2026-08-14T12:00:00.000Z',
    paymentProofPath: 'order/comprobante.pdf',
    paymentProofUploadedAt: '2026-08-14T12:05:00.000Z',
    athlete: { id: 'a1', fullName: 'Agustín Demo', documentId: '30111222', email: 'a@pluarg.test' },
    ...overrides,
  }
}

async function renderOrders(validationEnabled) {
  render(
    <I18nProvider>
      <AthletePaymentOrdersSection
        canEdit
        validationEnabled={validationEnabled}
        onApprovePayment={async () => ({})}
        onRejectPayment={async () => ({})}
      />
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())
  // `DataTable` pinta cada fila dos veces (tabla desktop + cards mobile). El
  // conteo se hace dentro de la tabla para que sea una fila = un botón.
  return within(screen.getByRole('table'))
}

describe('bandeja de Finanzas con la validación congelada', () => {
  beforeEach(() => {
    vi.mocked(listAthletePaymentOrders).mockResolvedValue([
      order({ id: '11111111-1111-4111-8111-111111111111', concept: 'membership' }),
      order({
        id: '22222222-2222-4222-8222-222222222222',
        concept: 'registration',
        conceptLabel: 'Inscripción Pitbull',
      }),
      order({ id: '33333333-3333-4333-8333-333333333333', concept: 'combo', conceptLabel: 'Combo' }),
    ])
  })

  it('habilita validar cuando los tres interruptores están abiertos', async () => {
    const table = await renderOrders({ membership: true, registration: true, ticket: true })
    const buttons = table.getAllByRole('button', { name: /^validar$/i })
    expect(buttons).toHaveLength(3)
    for (const button of buttons) expect(button.disabled).toBe(false)
    expect(table.queryAllByRole('button', { name: /validación pausada/i })).toHaveLength(0)
  })

  it('deshabilita solo el concepto congelado y explica por qué', async () => {
    const table = await renderOrders({ membership: false, registration: true, ticket: true })

    // Afiliación congelada; el combo también, porque acredita las dos cosas.
    const paused = table.getAllByRole('button', { name: /validación pausada/i })
    expect(paused).toHaveLength(2)
    for (const button of paused) expect(button.disabled).toBe(true)

    // La inscripción, con su interruptor abierto, sigue operable.
    const usable = table.getAllByRole('button', { name: /^validar$/i })
    expect(usable).toHaveLength(1)
    expect(usable[0].disabled).toBe(false)
  })
})

describe('pantalla de Acceso y habilitación', () => {
  it('expone los diez interruptores agrupados por eje', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, true])),
    )

    render(
      <I18nProvider>
        <RegistrationAccessSection
          canEdit
          configuration={{ membershipGate: null, eventGates: [] }}
          adminEvents={[]}
          onRefresh={() => {}}
          onSave={async () => ({})}
        />
      </I18nProvider>,
    )

    await waitFor(() => expect(fetchPlatformFeatureToggles).toHaveBeenCalled())

    // Un switch por interruptor, ni más ni menos.
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(10))

    for (const heading of [/altas nuevas/i, /transferencia y efectivo/i, /validación y activación/i]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    // Los tres ejes por concepto, con nombre accesible propio.
    for (const name of [
      /habilitar venta de entradas/i,
      /habilitar afiliación por transferencia o efectivo/i,
      /habilitar validación de entradas/i,
    ]) {
      expect(screen.getByRole('checkbox', { name })).toBeTruthy()
    }
  })

  it('muestra cerrado el interruptor apagado', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue({
      ...Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, true])),
      ticketValidationEnabled: false,
    })

    render(
      <I18nProvider>
        <RegistrationAccessSection
          canEdit
          configuration={{ membershipGate: null, eventGates: [] }}
          adminEvents={[]}
          onRefresh={() => {}}
          onSave={async () => ({})}
        />
      </I18nProvider>,
    )

    const frozen = await waitFor(() =>
      screen.getByRole('checkbox', { name: /habilitar validación de entradas/i }),
    )
    expect(frozen.checked).toBe(false)
    expect(
      screen.getByRole('checkbox', { name: /habilitar validación de afiliaciones/i }).checked,
    ).toBe(true)
  })
})
