import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * `PaymentTraceDialog` es lo que muestra el stack completo de por qué un cobro
 * (afiliación, inscripción o entradas) no acreditó. No tenía test propio pese
 * a estar en producción — este archivo cierra ese hueco.
 */

vi.mock('../src/services/paymentService.js', () => ({
  getPaymentOrderAudit: vi.fn(),
}))

const { getPaymentOrderAudit } = await import('../src/services/paymentService.js')
const PaymentTraceDialog = (await import('../src/components/admin/PaymentTraceDialog.jsx')).default

function renderWithI18n(ui) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const REPORT = {
  verdict: {
    state: 'blocked',
    summary: 'El cobro se cortó por una falla.',
    action: 'Reintentar la conciliación desde Panel > Pagos.',
  },
  stageReached: 'provider_submitted',
  timeline: [
    {
      at: '2026-08-13T21:58:00.000Z',
      source: 'orden',
      event: 'order.created',
      status: 'pendiente',
      severity: 'info',
      sincePrevious: null,
      failure: null,
    },
    {
      at: '2026-08-13T21:58:44.000Z',
      source: 'webhook',
      event: 'webhook.payment.failed',
      status: 'failed',
      severity: 'danger',
      sincePrevious: '44 s',
      failure: {
        message: 'El monto no coincide con la preferencia.',
        origin: { file: 'server/modules/payments/mercadoPagoAdapter.js', line: 128, function: 'createPayment' },
        entrypoint: 'POST /api/payments/embedded/process',
        requestId: 'req-abc123',
        provider: { code: 'AMOUNT_MISMATCH', detail: 'Monto rechazado por MP' },
        diagnosis: {
          code: 'AMOUNT_MISMATCH',
          title: 'El monto enviado no coincide con la preferencia',
          cause: 'La preferencia se generó con otro monto.',
          fix: ['Recrear la preferencia', 'Reintentar el cobro'],
        },
        trail: [{ event: 'attempt.claimed', atMs: 12 }, { event: 'provider.submitted', atMs: 340 }],
        stack: 'Error: El monto no coincide con la preferencia.\n    at createPayment (mercadoPagoAdapter.js:128:11)',
      },
    },
  ],
}

describe('PaymentTraceDialog', () => {
  it('no renderiza nada sin orderId', () => {
    const { container } = renderWithI18n(<PaymentTraceDialog orderId={null} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
    expect(getPaymentOrderAudit).not.toHaveBeenCalled()
  })

  it('pide la traza al abrir y muestra un estado de carga', async () => {
    let resolveReport
    getPaymentOrderAudit.mockReturnValue(new Promise((resolve) => { resolveReport = resolve }))

    renderWithI18n(<PaymentTraceDialog orderId="order-1" onClose={() => {}} />)

    expect(getPaymentOrderAudit).toHaveBeenCalledWith('order-1')
    expect((await screen.findByRole('status')).textContent).toBe('Reconstruyendo el recorrido…')

    resolveReport(REPORT)
    await waitFor(() => expect(screen.queryByText('Reconstruyendo el recorrido…')).toBeNull())
  })

  it('informa el error en vez de quedarse cargando para siempre', async () => {
    getPaymentOrderAudit.mockRejectedValue(new Error('Supabase caído'))

    renderWithI18n(<PaymentTraceDialog orderId="order-1" onClose={() => {}} />)

    expect(await screen.findByText('Supabase caído')).toBeTruthy()
  })

  it('muestra el veredicto, la línea de tiempo y el stack completo de la falla', async () => {
    getPaymentOrderAudit.mockResolvedValue(REPORT)

    renderWithI18n(<PaymentTraceDialog orderId="order-1" onClose={() => {}} />)

    expect(await screen.findByText('El cobro se cortó por una falla.')).toBeTruthy()
    expect(screen.getByText('Reintentar la conciliación desde Panel > Pagos.')).toBeTruthy()
    expect(screen.getByText('El monto no coincide con la preferencia.')).toBeTruthy()
    expect(screen.getByText('El monto enviado no coincide con la preferencia')).toBeTruthy()

    // El stack va colapsado dentro de un <details> — no debería mostrarse
    // truncado ni "[object Object]", sino el texto completo del error.
    const stackToggle = screen.getByText('Stack completo')
    expect(stackToggle.closest('details')).toBeTruthy()
    expect(stackToggle.closest('details').textContent).toContain('createPayment (mercadoPagoAdapter.js:128:11)')
  })

  it('copia el reporte completo como JSON', async () => {
    getPaymentOrderAudit.mockResolvedValue(REPORT)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderWithI18n(<PaymentTraceDialog orderId="order-1" onClose={() => {}} />)

    const copyButton = await screen.findByRole('button', { name: 'Copiar informe' })
    copyButton.click()

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(REPORT, null, 2)))
    expect(await screen.findByText('Informe copiado')).toBeTruthy()
  })

  it('cierra al clickear el fondo', async () => {
    getPaymentOrderAudit.mockResolvedValue(REPORT)
    const onClose = vi.fn()

    renderWithI18n(<PaymentTraceDialog orderId="order-1" onClose={onClose} />)
    await screen.findByText('El cobro se cortó por una falla.')

    screen.getByLabelText('Cerrar la traza').click()
    expect(onClose).toHaveBeenCalled()
  })
})
