import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import ActionQueue from '../src/components/admin/ActionQueue.jsx'
import { getAthletePaymentProofUrl } from '../src/services/athleteApi.js'

vi.mock('../src/services/athleteApi.js', () => ({
  getAthletePaymentProofUrl: vi.fn(async () => 'https://cdn.example/proof.jpg'),
}))

vi.mock('../src/services/ticketApi.js', () => ({
  getTicketPaymentProofUrl: vi.fn(async () => 'https://cdn.example/ticket.pdf'),
}))

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

const PAYMENT_ITEM = {
  id: 'action-pay-p1',
  type: 'payment',
  priority: 'high',
  subject: 'Test Athlete 1',
  summary: 'Validar pago manual',
  detail: 'Afiliación anual',
  meta: '$ 38.000',
  section: 'payments',
  paymentId: 'p1',
  method: 'manual_link',
  hasProof: true,
  paymentProofPath: 'proofs/p1.jpg',
}

const PAYMENT_NO_PROOF = {
  ...PAYMENT_ITEM,
  id: 'action-pay-p2',
  paymentId: 'p2',
  hasProof: false,
  paymentProofPath: null,
  requiresProofOverride: true,
}

function renderQueue(items, overrides = {}) {
  return render(
    <I18nProvider>
      <ActionQueue
        compact
        embedded
        showHeader={false}
        showGroupHeads={false}
        items={items}
        canEdit
        onApprovePayment={vi.fn(async () => ({}))}
        onApproveTicketOrder={vi.fn(async () => ({}))}
        onNavigate={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('ActionQueue — Validar abre modal de revisión', () => {
  it('abre el dialog con preview y confirma el approve', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Test Athlete 1')).toBeTruthy()
    expect(within(dialog).getByText('Afiliación anual')).toBeTruthy()

    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: 'Comprobante de pago' })).toBeTruthy()
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar validación' }))

    await waitFor(() => {
      expect(onApprovePayment).toHaveBeenCalledWith('p1', {})
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('permite acreditar transferencia sin comprobante con motivo de override', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_NO_PROOF], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sin comprobante cargado')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar validación' })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText('Motivo del override'), {
      target: { value: 'Verificado en extracto bancario del 30/08.' },
    })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => {
      expect(onApprovePayment).toHaveBeenCalledWith('p2', {
        overrideReason: 'Verificado en extracto bancario del 30/08.',
      })
    })
  })

  it('mantiene el efectivo presencial como validación operativa sin archivo', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([{ ...PAYMENT_NO_PROOF, cashAtPitbull: true, requiresProofOverride: false }], {
      onApprovePayment,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar validación' }))

    await waitFor(() => {
      expect(onApprovePayment).toHaveBeenCalledWith('p2', {})
    })
  })

  /**
   * El efectivo reserva el cupo hasta el día del torneo, así que rechazarlo es
   * la única forma de devolverlo cuando el atleta no se presenta a pagar. No
   * hay archivo que revisar: la decisión es operativa.
   */
  it('deja rechazar el efectivo presencial aunque no haya comprobante', async () => {
    const onRejectPayment = vi.fn(async () => ({}))
    renderQueue([{ ...PAYMENT_NO_PROOF, cashAtPitbull: true, requiresProofOverride: false }], {
      onRejectPayment,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }))
    fireEvent.change(within(dialog).getByLabelText('Motivo del rechazo'), {
      target: { value: 'No se presentó a pagar en la sede.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar rechazo' }))

    await waitFor(() => {
      expect(onRejectPayment).toHaveBeenCalledWith('p2', 'No se presentó a pagar en la sede.')
    })
  })

  it('permite rechazar una transferencia sin comprobante desde el override', async () => {
    const onRejectPayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_NO_PROOF], { onRejectPayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }))
    fireEvent.change(within(dialog).getByLabelText('Motivo del rechazo'), {
      target: { value: 'No hay evidencia de transferencia.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar rechazo' }))

    await waitFor(() => {
      expect(onRejectPayment).toHaveBeenCalledWith('p2', 'No hay evidencia de transferencia.')
    })
  })

  it('no permite confirmar hasta que el comprobante se pueda abrir', async () => {
    getAthletePaymentProofUrl.mockRejectedValueOnce(new Error('Archivo no disponible'))
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')

    await waitFor(() => {
      expect(within(dialog).getByText('Archivo no disponible')).toBeTruthy()
    })
    expect(within(dialog).getByRole('button', { name: 'Confirmar validación' }).disabled).toBe(true)
    expect(onApprovePayment).not.toHaveBeenCalled()
  })

  it('cancela sin aprobar', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(onApprovePayment).not.toHaveBeenCalled()
  })
})

describe('ActionQueue — Ver inspecciona el comprobante', () => {
  it('muestra el chip de comprobante en la card', () => {
    renderQueue([PAYMENT_ITEM, PAYMENT_NO_PROOF])

    expect(screen.getByRole('button', { name: 'Ver comprobante' })).toBeTruthy()
    expect(screen.getByText('Sin adjuntar')).toBeTruthy()
  })

  it('abre el preview desde el chip si hay archivo adjunto', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toMatch(/payment-validation-dialog__panel--view/)
    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: 'Comprobante de pago' })).toBeTruthy()
    })
    expect(onApprovePayment).not.toHaveBeenCalled()
  })

  it('trata el path de storage como comprobante aunque hasProof venga false', async () => {
    renderQueue([
      {
        ...PAYMENT_NO_PROOF,
        hasProof: false,
        paymentProofPath: 'proofs/p2.jpg',
      },
    ])

    expect(screen.getByRole('button', { name: 'Ver comprobante' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: 'Comprobante de pago' })).toBeTruthy()
    })
  })

  it('abre el preview y no acredita el pago', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    const onNavigate = vi.fn()
    renderQueue([PAYMENT_ITEM], { onApprovePayment, onNavigate })

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toMatch(/payment-validation-dialog__panel--view/)
    expect(within(dialog).getByRole('heading', { name: 'Ver comprobante' })).toBeTruthy()
    expect(within(dialog).getByText('Comprobante cargado por la persona.')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Confirmar validación' })).toBeNull()

    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: 'Comprobante de pago' })).toBeTruthy()
    })
    expect(
      within(dialog).getByRole('button', { name: 'Ver el comprobante a tamaño real' }),
    ).toBeTruthy()

    const actions = dialog.querySelector('.payment-validation-dialog__actions')
    fireEvent.click(within(actions).getByRole('button', { name: /^Cerrar$/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(onApprovePayment).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('muestra el empty si no hay archivo adjunto', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_NO_PROOF], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sin comprobante cargado')).toBeTruthy()
    expect(within(dialog).getByText('Esta orden todavía no tiene un archivo adjunto.')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Confirmar validación' })).toBeNull()
    expect(onApprovePayment).not.toHaveBeenCalled()
  })

  it('usa el path de storage para un PDF aunque la URL firmada no tenga extensión', async () => {
    getAthletePaymentProofUrl.mockResolvedValueOnce('https://cdn.example/sign/abc?token=1')
    renderQueue([
      {
        ...PAYMENT_ITEM,
        paymentProofPath: 'p1/123-comprobante.pdf',
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(within(dialog).getByTitle('Comprobante de pago')).toBeTruthy()
    })
    expect(within(dialog).queryByRole('img')).toBeNull()
  })

  it('sigue navegando cuando la tarea no es un pago', () => {
    const onNavigate = vi.fn()
    renderQueue(
      [
        {
          id: 'action-reg-1',
          type: 'registration',
          priority: 'medium',
          subject: 'Test Athlete 1',
          summary: 'Inscripción pendiente de pago',
          detail: 'Pitbull Classic',
          section: 'registrations',
        },
      ],
      { onNavigate },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(onNavigate).toHaveBeenCalledWith('registrations', null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('nombra como afiliación requerida la validación previa al check-in', () => {
    renderQueue([
      {
        id: 'action-gate-1',
        type: 'registration_gate',
        priority: 'medium',
        subject: 'Sebastian Alfaro',
        summary: 'Confirmada sin afiliación vigente',
        detail: 'Pitbull Classic',
        meta: 'Raw',
        section: 'registrations',
      },
    ])

    expect(screen.getByText('Afiliación requerida')).toBeTruthy()
    expect(screen.queryByText('Puerta')).toBeNull()
  })
})

describe('ActionQueue — lectura compacta por tipo', () => {
  it('agrupa el mismo tipo aunque cambie la prioridad y no arma cajas de encabezado', () => {
    renderQueue([
      PAYMENT_ITEM,
      { ...PAYMENT_ITEM, id: 'action-pay-p3', paymentId: 'p3', priority: 'medium' },
      {
        id: 'action-reg-1',
        type: 'registration',
        priority: 'high',
        subject: 'Otra atleta',
        summary: 'Inscripción observada',
        detail: 'Pitbull Classic',
        section: 'registrations',
      },
    ])

    expect(document.querySelectorAll('.action-queue__type-head')).toHaveLength(0)
    expect(document.querySelectorAll('.action-queue__type-block')).toHaveLength(2)
    expect(screen.getAllByText('Pago')).toHaveLength(2)
    expect(screen.getAllByText('Inscripción')).toHaveLength(1)
    expect(screen.queryByText('Urgente')).toBeNull()
    expect(screen.queryByText('Pendiente')).toBeNull()
  })

  it('conserva los grupos de prioridad cuando el drawer los pide', () => {
    renderQueue(
      [PAYMENT_ITEM, { ...PAYMENT_NO_PROOF, priority: 'medium', subject: 'Otra atleta' }],
      { showGroupHeads: true },
    )

    expect(screen.getByText('Urgente')).toBeTruthy()
    expect(screen.getByText('Pendiente')).toBeTruthy()
    expect(screen.getAllByText('Pago')).toHaveLength(2)
  })
})
