import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Cobertura de la resolución del merge en la columna de comprobante y en el
 * botón de validar de Finanzas.
 *
 * Los dos lados que se juntaron proponían la misma regla con distinta forma: uno
 * la resolvía con `paymentValidationService` (que es donde vive y donde la aplica
 * el backend), el otro la escribía inline con una lista de estados local. El
 * lado inline además aportaba algo que faltaba: decir que falta el comprobante
 * en vez de dejar un botón deshabilitado sin motivo.
 *
 * Estos tests fijan el resultado combinado, que es lo que un merge mal resuelto
 * rompería en silencio: ofrecer acreditar una orden sin comprobante, o dejar de
 * ofrecerlo cuando sí corresponde.
 */

// Mock completo, no parcial: omitir una función del módulo desvía el componente
// a otra rama y deja el test verde sin haber probado nada.
vi.mock('../src/services/athleteApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listAthletePaymentOrders: vi.fn(),
    getAthletePaymentProofUrls: vi.fn(async () => ({})),
  }
})

const { listAthletePaymentOrders } = await import('../src/services/athleteApi.js')

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  }
})

afterEach(cleanup)

function order(overrides = {}) {
  return {
    id: 'ord-1',
    athlete: { fullName: 'Ana Torres', documentId: '30111222' },
    concept: 'membership',
    conceptLabel: 'Afiliación anual',
    amount: 85000,
    currency: 'ARS',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    status: 'validacion_manual',
    reference: 'MORD-abc',
    paymentProofPath: 'ord-1/comprobante.jpg',
    paymentProofUploadedAt: '2026-08-20T19:06:32.000Z',
    createdAt: '2026-08-20T18:00:00.000Z',
    ...overrides,
  }
}

async function renderSection(orders, props = {}) {
  listAthletePaymentOrders.mockResolvedValue({ orders, counts: null })
  const { default: AthletePaymentOrdersSection } = await import(
    '../src/pages/admin/AthletePaymentOrdersSection.jsx'
  )
  render(
    <I18nProvider>
      <AthletePaymentOrdersSection canEdit {...props} />
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.getByText('Ana Torres')).toBeTruthy())
}

describe('Finanzas — comprobante y validación', () => {
  it('el comprobante se abre desde la fecha, que ahora es un botón', async () => {
    await renderSection([order()])

    const proof = document.querySelector('button.admin-orders-block__proof')
    expect(proof).toBeTruthy()
    // La fecha sigue siendo el texto: es el dato con el que se cruza el
    // comprobante contra el extracto.
    expect(proof.textContent).toContain('20/8/26')
    // Sin `style` inline: la clase ya trae el botón resuelto. Un inline con
    // `height: auto` rompía el target táctil de 32px.
    expect(proof.getAttribute('style')).toBeNull()
  })

  it('avisa que falta el comprobante en vez de dejar un botón muerto', async () => {
    await renderSection([order({ paymentProofPath: null })])

    // Dos veces: la columna de comprobante (que ya existía) y la celda de
    // acción, que es la que reemplaza al botón muerto por el motivo.
    expect(screen.getAllByText('Sin comprobante')).toHaveLength(2)
    // Y no ofrece validar: acreditar sin comprobante es indistinguible de
    // regalar la afiliación, y el backend lo rechaza igual.
    expect(screen.queryByRole('button', { name: 'Validar' })).toBeNull()
  })

  it('el efectivo en sede se puede validar sin comprobante', async () => {
    // La evidencia es el cobro presencial, no un archivo. Si el merge hubiera
    // dejado la condición inline, este caso quedaba bloqueado.
    await renderSection([
      order({ manualPaymentChannel: 'cash_pitbull', paymentProofPath: null }),
    ])

    expect(screen.queryByText('Sin comprobante')).toBeNull()
    expect(screen.getByRole('button', { name: 'Validar' })).toBeTruthy()
  })

  it('una orden ya aprobada no pide comprobante ni ofrece validar', async () => {
    await renderSection([order({ status: 'aprobado', paymentProofPath: null })])

    // Una sola vez, y es la columna de comprobante: la orden efectivamente no
    // tiene adjunto (se acreditó por otra vía). La celda de acción NO lo repite,
    // porque ya no hay decisión pendiente que el motivo tenga que explicar.
    expect(screen.getAllByText('Sin comprobante')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Validar' }).disabled).toBe(true)
  })

  it('Mercado Pago no se valida a mano y lo dice', async () => {
    await renderSection([
      order({ method: 'mercado_pago', manualPaymentChannel: null, paymentProofPath: null }),
    ])

    // Se conserva el botón deshabilitado con su motivo en vez de ocultarlo: un
    // control que desaparece no explica por qué no está.
    const button = screen.getByRole('button', { name: 'Mercado Pago se acredita por webhook' })
    expect(button.disabled).toBe(true)
    expect(screen.queryByText('Sin comprobante')).toBeNull()
  })
})
