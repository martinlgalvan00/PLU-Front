import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(),
    savePlatformFeatureToggle: vi.fn(),
    savePaymentChannel: vi.fn(),
  }
})

const { listAthletePaymentOrders } = await import('../src/services/athleteApi.js')
const { fetchPlatformFeatureToggles, savePaymentChannel, PLATFORM_TOGGLE_KEYS } = await import(
  '../src/services/platformSettingsAdminService.js'
)

const ALL_OPEN = { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true }

/**
 * Estado que devuelve el servicio: los booleanos por concepto más la matriz de
 * canales. `paymentChannels` viene siempre completa desde `mapToggles`.
 */
function togglesState({ channels = {}, ...overrides } = {}) {
  return {
    ...Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, true])),
    paymentChannels: {
      membership: { ...ALL_OPEN },
      registration: { ...ALL_OPEN },
      ticket: { ...ALL_OPEN },
      ...channels,
    },
    environmentHolds: [],
    ...overrides,
  }
}

function renderAccessSection({ canEdit = true } = {}) {
  return render(
    <I18nProvider>
      <RegistrationAccessSection
        canEdit={canEdit}
        configuration={{ membershipGate: null, eventGates: [] }}
        adminEvents={[]}
        onRefresh={() => {}}
        onSave={async () => ({})}
      />
    </I18nProvider>,
  )
}
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
  it('expone un interruptor por alta, por medio de cobro y por validación', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(togglesState())

    renderAccessSection()
    await waitFor(() => expect(fetchPlatformFeatureToggles).toHaveBeenCalled())

    // 1 maestro + 3 altas + 3 validaciones + 11 celdas de canal (entradas no
    // ofrece efectivo, que no existe en su checkout; Wise sí se ofrece en los
    // tres conceptos).
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(18))

    // Un bloque por concepto, no cuatro grupos por eje. Se busca dentro de la
    // sección de interruptores: la de tandas privadas también nombra los
    // conceptos.
    const toggles = within(screen.getByRole('region', { name: /habilitación general/i }))
    for (const heading of [/^afiliaciones$/i, /^inscripciones$/i, /^entradas$/i]) {
      expect(toggles.getByRole('heading', { name: heading })).toBeTruthy()
    }
    // Cada medio de cobro tiene control propio y nombre accesible propio.
    for (const name of [
      /habilitar mercado pago para afiliaciones/i,
      /habilitar transferencia bancaria para afiliaciones/i,
      /habilitar efectivo en pitbull para afiliaciones/i,
      /habilitar wise para afiliaciones/i,
      /habilitar mercado pago para inscripciones/i,
      /habilitar wise para inscripciones/i,
      /habilitar transferencia bancaria para entradas/i,
      /habilitar wise para entradas/i,
      /habilitar venta de entradas/i,
      /habilitar validación de entradas/i,
    ]) {
      expect(screen.getByRole('checkbox', { name })).toBeTruthy()
    }
    // Efectivo para entradas no se ofrece: sería un interruptor sin efecto.
    expect(
      screen.queryByRole('checkbox', { name: /habilitar efectivo en pitbull para entradas/i }),
    ).toBeNull()
  })

  it('resume cuántos interruptores quedaron abiertos, canales incluidos', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      togglesState({
        ticketValidationEnabled: false,
        channels: { membership: { ...ALL_OPEN, cash_pitbull: false } },
      }),
    )

    renderAccessSection()

    // El operador tiene que poder responder "¿está todo abierto?" sin leer las
    // dieciocho filas.
    expect(await screen.findByText('16 de 18 habilitados')).toBeTruthy()
  })

  // Lo que antes era imposible desde el panel: la pasarela no era cerrable.
  it('cierra Mercado Pago de un concepto sin tocar los otros medios', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(togglesState())
    vi.mocked(savePaymentChannel).mockResolvedValue(
      togglesState({ channels: { membership: { ...ALL_OPEN, mercado_pago: false } } }),
    )

    renderAccessSection()
    const mercadoPago = await waitFor(() =>
      screen.getByRole('checkbox', { name: /habilitar mercado pago para afiliaciones/i }),
    )
    fireEvent.click(mercadoPago)

    await waitFor(() =>
      expect(savePaymentChannel).toHaveBeenCalledWith('membership', 'mercado_pago', false),
    )
    await waitFor(() => expect(mercadoPago.checked).toBe(false))
    expect(
      screen.getByRole('checkbox', { name: /habilitar transferencia bancaria para afiliaciones/i })
        .checked,
    ).toBe(true)
  })

  it('avisa cuando un concepto queda sin ningún medio de cobro', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      togglesState({
        channels: {
          registration: {
            mercado_pago: false,
            bank_transfer: false,
            cash_pitbull: false,
            wise_transfer: false,
          },
        },
      }),
    )

    renderAccessSection()

    // Un solo aviso: el del concepto que quedó sin medios, no uno por fila.
    const warnings = await screen.findAllByText(/sin ningún medio abierto/i)
    expect(warnings).toHaveLength(1)
  })

  it('avisa cuando una variable de entorno frena los cobros por encima del panel', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      togglesState({
        environmentHolds: [{ variable: 'PAID_CHECKOUT_ENABLED', scope: 'checkout' }],
      }),
    )

    renderAccessSection()

    expect(await screen.findByText(/PAID_CHECKOUT_ENABLED/)).toBeTruthy()
  })

  it('sigue diciendo el estado de cada interruptor sin permiso de edición', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      togglesState({ registrationEnabled: false }),
    )

    renderAccessSection({ canEdit: false })

    // Sin switch que lo muestre, el estado viaja como texto.
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0))
    expect(screen.getAllByText('Habilitadas')).toHaveLength(2)
    expect(screen.getByText('Cerradas')).toBeTruthy()
    expect(screen.getByText('Habilitados')).toBeTruthy()
    expect(screen.getAllByText('Habilitada')).toHaveLength(3)
    expect(screen.getAllByText('Activo')).toHaveLength(11)
  })

  it('muestra cerrado el interruptor apagado', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(
      togglesState({ ticketValidationEnabled: false }),
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

    const frozen = await waitFor(() =>
      screen.getByRole('checkbox', { name: /habilitar validación de entradas/i }),
    )
    expect(frozen.checked).toBe(false)
    expect(
      screen.getByRole('checkbox', { name: /habilitar validación de afiliaciones/i }).checked,
    ).toBe(true)
  })

  it('reabre una tanda cerrada sin arrastrar su fecha de cierre vencida', async () => {
    vi.mocked(fetchPlatformFeatureToggles).mockResolvedValue(togglesState())
    const onSave = vi.fn().mockResolvedValue({})

    render(
      <I18nProvider>
        <RegistrationAccessSection
          canEdit
          configuration={{
            membershipGate: {
              id: 'gate-membership',
              scope: 'membership',
              label: 'PIT',
              active: false,
              startsAt: null,
              endsAt: '2026-08-14T20:51:00.000Z',
            },
            eventGates: [],
          }}
          adminEvents={[]}
          onRefresh={() => {}}
          onSave={onSave}
        />
      </I18nProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /reabrir tanda/i }))

    expect(screen.getAllByText(/código nuevo/i).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Abre').value).toBe('')
    expect(screen.getByLabelText('Cierra').value).toBe('')
    expect(screen.getByRole('checkbox', { name: /habilitar tanda/i }).checked).toBe(true)

    fireEvent.change(screen.getByLabelText(/^Código/), { target: { value: ' NUEVO-CODIGO-2026 ' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar tanda/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      code: 'NUEVO-CODIGO-2026',
      startsAt: '',
      endsAt: '',
    })))
  })
})
