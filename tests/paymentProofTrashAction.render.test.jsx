import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import PaymentValidationDialog from '../src/components/admin/PaymentValidationDialog.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Baja del comprobante de una orden ya resuelta, desde el diálogo en modo
 * lectura. Es reversible (queda en la papelera) pero deja la orden sin archivo,
 * así que pide una confirmación en el mismo lugar, y Escape cierra esa
 * confirmación antes de cerrar el diálogo.
 */

// La URL del comprobante la pide el diálogo cuando el item no la trae: acá siempre falla,
// que es el caso del archivo ausente en Storage.
vi.mock('../src/services/athleteApi.js', () => ({
  getAthletePaymentProofUrl: vi.fn(async () => {
    throw new Error('El comprobante no existe.')
  }),
}))
vi.mock('../src/services/ticketApi.js', () => ({
  getTicketPaymentProofUrl: vi.fn(async () => {
    throw new Error('El comprobante no existe.')
  }),
}))

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ITEM = {
  mode: 'view',
  type: 'payment',
  paymentId: 'ord-1',
  hasProof: true,
  paymentProofPath: 'ord-1/a.png',
  // Precargada: el diálogo no pide la URL y dibuja el comprobante enseguida.
  proofUrl: 'https://cdn.example/a.png',
  subject: 'Ana Torres',
  detail: 'Afiliación · MORD-1',
  canTrashProof: true,
}

function renderDialog({ item = ITEM, onTrashProof, mode = 'view', onCancel = vi.fn() } = {}) {
  render(
    <I18nProvider>
      <PaymentValidationDialog
        item={item}
        mode={mode}
        onCancel={onCancel}
        onConfirm={vi.fn()}
        onTrashProof={onTrashProof}
      />
    </I18nProvider>,
  )
  return { onCancel }
}

const trashButton = () => screen.queryByRole('button', { name: 'Mover a la papelera' })

describe('PaymentValidationDialog — baja del comprobante', () => {
  it('se ofrece en lectura, con comprobante, cuando el que abre decidió que corresponde', () => {
    renderDialog({ onTrashProof: vi.fn() })
    expect(trashButton()).toBeTruthy()
  })

  it('no se ofrece sin quien la ejecute, sin permiso del item, sin comprobante ni fuera de lectura', () => {
    const onTrashProof = vi.fn()
    renderDialog({ onTrashProof: undefined })
    expect(trashButton()).toBeNull()
    cleanup()

    renderDialog({ item: { ...ITEM, canTrashProof: false }, onTrashProof })
    expect(trashButton()).toBeNull()
    cleanup()

    renderDialog({ item: { ...ITEM, canTrashProof: undefined }, onTrashProof })
    expect(trashButton()).toBeNull()
    cleanup()

    renderDialog({ item: { ...ITEM, hasProof: false, paymentProofPath: null, proofUrl: null }, onTrashProof })
    expect(trashButton()).toBeNull()
    cleanup()

    // Validar o acreditar una orden abierta nunca ofrece la baja: ahí el archivo
    // es lo que hay que revisar.
    renderDialog({ mode: 'validate', onTrashProof })
    expect(trashButton()).toBeNull()
  })

  it('pide confirmar antes de hacer nada, y explica qué pasa', () => {
    const onTrashProof = vi.fn()
    renderDialog({ onTrashProof })
    fireEvent.click(trashButton())

    expect(onTrashProof).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/Se puede restaurar desde Cobros/)
    expect(screen.getByRole('button', { name: 'Sí, mover' })).toBeTruthy()
  })

  it('cancelar vuelve al botón sin llamar a nadie', () => {
    const onTrashProof = vi.fn()
    renderDialog({ onTrashProof })
    fireEvent.click(trashButton())
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onTrashProof).not.toHaveBeenCalled()
    expect(trashButton()).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sí, mover' })).toBeNull()
  })

  it('Escape cierra primero la confirmación y recién después el diálogo', () => {
    const { onCancel } = renderDialog({ onTrashProof: vi.fn() })
    fireEvent.click(trashButton())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Sí, mover' })).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('confirmar la ejecuta una vez y muestra que está trabajando; mientras tanto Escape no cierra', async () => {
    let finish
    const onTrashProof = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const { onCancel } = renderDialog({ onTrashProof })
    fireEvent.click(trashButton())
    fireEvent.click(screen.getByRole('button', { name: 'Sí, mover' }))

    const busy = await screen.findByRole('button', { name: 'Moviendo…' })
    expect(busy.disabled).toBe(true)
    expect(onTrashProof).toHaveBeenCalledTimes(1)
    // Un segundo clic no repite la baja.
    fireEvent.click(busy)
    expect(onTrashProof).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
    finish()
  })

  it('si la baja falla muestra el motivo y deja el diálogo abierto para reintentar', async () => {
    const onTrashProof = vi.fn().mockRejectedValue(
      new Error('Solo se puede mover a la papelera el comprobante de una orden ya resuelta.'),
    )
    renderDialog({ onTrashProof })
    fireEvent.click(trashButton())
    fireEvent.click(screen.getByRole('button', { name: 'Sí, mover' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/orden ya resuelta/),
    )
    expect(screen.queryByRole('button', { name: 'Sí, mover' })).toBeNull()
    // Se puede volver a intentar.
    expect(trashButton()).toBeTruthy()
  })

  it('un error sin mensaje usa el texto genérico', async () => {
    renderDialog({ onTrashProof: vi.fn().mockRejectedValue(new Error('')) })
    fireEvent.click(trashButton())
    fireEvent.click(screen.getByRole('button', { name: 'Sí, mover' }))
    expect(await screen.findByText('No pudimos mover el comprobante a la papelera.')).toBeTruthy()
  })

  it('se ofrece aunque el archivo no cargue: es justo el comprobante roto el que hay que poder dar de baja', async () => {
    // Sin URL precargada el diálogo la pide, falla y muestra el error del archivo.
    renderDialog({
      item: { ...ITEM, proofUrl: null },
      onTrashProof: vi.fn(),
    })
    expect(await screen.findByText('No se pudo cargar el comprobante')).toBeTruthy()
    expect(trashButton()).toBeTruthy()
  })
})
