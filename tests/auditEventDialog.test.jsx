import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Lo que este render protege es que el detalle no vuelva a esconder lo que la
 * base ya guarda.
 *
 * La tabla de auditoría mostraba el mensaje del error y nada más. El código, el
 * status HTTP, el archivo y la línea de origen, el stack completo, la cadena de
 * causas y el diagnóstico con sus pasos de arreglo estaban en `metadata` desde
 * el primer día, y para verlos había que consultar la base a mano.
 */

const fetchContext = vi.fn()

vi.mock('../src/services/auditService.js', async () => {
  const actual = await vi.importActual('../src/services/auditService.js')
  return { ...actual, fetchAuditEventContext: (...args) => fetchContext(...args) }
})

const AuditEventDialog = (await import('../src/components/admin/AuditEventDialog.jsx')).default
const { normalizeAuditEntry } = await import('../src/services/auditService.js')

function row(overrides = {}) {
  return normalizeAuditEntry({
    id: 'event-1',
    source: 'payment',
    action: 'payment.failed',
    entity_type: 'athlete_payment_order',
    entity_id: 'order-9',
    actor_type: 'athlete',
    actor_id: 'athlete-3',
    status: 'failed',
    severity: 'danger',
    created_at: '2026-08-15T02:12:50.000Z',
    metadata: {
      requestId: 'req-abc',
      stage: 'order_create:membership',
      entrypoint: 'http:POST /api/athletes/me/membership-orders',
      amount: 85000,
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        name: 'HttpError',
        status: 403,
        message: 'Confirmá tu correo antes de continuar.',
        stack: 'HttpError: Confirmá tu correo\n    at assertEmailVerified (server/routes/athletes.js:526:13)',
        origin: { file: 'server/routes/athletes.js', line: 526, column: 13, function: 'assertEmailVerified' },
        cause: { name: 'DbError', message: 'la verificación nunca se registró' },
      },
      diagnosis: {
        title: 'El correo no está verificado',
        cause: 'La orden se cortó porque el atleta todavía no confirmó su correo.',
        fix: ['Pedir un enlace nuevo desde el checkout.', 'Revisar rebotes en Auditoría.'],
        retryable: true,
      },
    },
    ...overrides,
  })
}

function renderDialog(props = {}) {
  return render(
    <I18nProvider>
      <AuditEventDialog eventId="event-1" onClose={() => {}} {...props} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  fetchContext.mockResolvedValue({
    event: row(),
    context: {
      request: [],
      actorBefore: [
        normalizeAuditEntry({
          id: 'event-0',
          source: 'identity',
          action: 'auth.login_succeeded',
          entity_type: 'athlete',
          entity_id: 'athlete-3',
          actor_type: 'athlete',
          actor_id: 'athlete-3',
          status: 'succeeded',
          severity: 'success',
          metadata: {},
          created_at: '2026-08-15T02:10:00.000Z',
        }),
      ],
      actorAfter: [],
      entity: [],
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('detalle de un evento de auditoría', () => {
  it('muestra el error completo y no sólo el mensaje', async () => {
    renderDialog()

    expect(await screen.findByText('Confirmá tu correo antes de continuar.')).toBeTruthy()
    expect(screen.getByText('EMAIL_NOT_VERIFIED')).toBeTruthy()
    expect(screen.getByText('403')).toBeTruthy()
    expect(screen.getByText('HttpError')).toBeTruthy()
    expect(screen.getByText('order_create:membership')).toBeTruthy()
    expect(screen.getByText('req-abc')).toBeTruthy()
  })

  it('muestra el stack trace completo y el archivo de origen', async () => {
    renderDialog()
    await screen.findByText('Confirmá tu correo antes de continuar.')

    const stack = document.querySelector('.audit-detail__stack pre')
    expect(stack.textContent).toContain('at assertEmailVerified')
    // La coordenada exacta, sin obligar a leer el stack entero para encontrarla.
    expect(document.querySelector('.audit-detail__origin').textContent).toContain(
      'server/routes/athletes.js:526:13',
    )
    expect(document.querySelector('.audit-detail__origin').textContent).toContain(
      'assertEmailVerified()',
    )
  })

  it('explica por qué falló y qué hacer, con los pasos del catálogo', async () => {
    renderDialog()

    expect(await screen.findByText('El correo no está verificado')).toBeTruthy()
    expect(screen.getByText(/todavía no confirmó su correo/)).toBeTruthy()
    const fixes = document.querySelectorAll('.audit-detail__fix li')
    expect(fixes).toHaveLength(2)
    expect(fixes[0].textContent).toContain('Pedir un enlace nuevo')
  })

  it('encadena las causas anidadas', async () => {
    renderDialog()
    await screen.findByText('Confirmá tu correo antes de continuar.')

    const causes = document.querySelector('.audit-detail__causes')
    expect(causes.textContent).toContain('DbError')
    expect(causes.textContent).toContain('la verificación nunca se registró')
  })

  it('muestra qué venía haciendo la persona antes de la falla', async () => {
    // El eje que no existía: la respuesta estaba en la bitácora, repartida en
    // filas que nadie cruzaba.
    renderDialog()
    await screen.findByText('Confirmá tu correo antes de continuar.')

    const timeline = document.querySelectorAll('.audit-detail__timeline')
    expect(timeline.length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('Qué hizo antes esta persona')
    // La acción se muestra traducida, igual que en la tabla.
    expect(document.body.textContent).toContain('Inicio de sesión exitoso')
  })

  it('permite saltar a otro evento del contexto sin cerrar el diálogo', async () => {
    renderDialog()
    await screen.findByText('Confirmá tu correo antes de continuar.')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    await waitFor(() => expect(fetchContext).toHaveBeenCalledWith('event-0'))
  })

  it('no repite en el volcado crudo lo que ya mostró arriba', async () => {
    renderDialog()
    await screen.findByText('Confirmá tu correo antes de continuar.')

    const raw = document.querySelector('.audit-detail__raw pre')
    expect(raw.textContent).not.toContain('assertEmailVerified')
    expect(raw.textContent).toContain('85000')
  })

  it('explica un webhook descartado en vez de mostrar unsupported_type crudo', async () => {
    // Fila histórica: el backend no guardaba `diagnosis` en los descartes, así
    // que el panel mostraba "Por qué falló: unsupported_type" — y ni siquiera
    // es un pago rechazado, es una notificación de merchant_order descartada.
    fetchContext.mockResolvedValue({
      event: row({
        action: 'payment.webhook_discarded',
        status: 'skipped',
        severity: 'info',
        metadata: {
          reason: 'unsupported_type',
          notificationType: 'merchant_order',
          providerRequestId: 'req-mp-1',
        },
      }),
      context: { request: [], actorBefore: [], actorAfter: [], entity: [] },
    })

    renderDialog()

    expect(
      await screen.findByText('Notificación descartada: no es un pago rechazado'),
    ).toBeTruthy()
    expect(screen.getByText(/descarte es deliberado/)).toBeTruthy()
    // El código crudo no desaparece: queda como referencia etiquetada.
    expect(screen.getByText('unsupported_type')).toBeTruthy()
  })

  it('explica un rechazo de Mercado Pago con causa y pasos, no solo el código', async () => {
    fetchContext.mockResolvedValue({
      event: row({
        action: 'payment.applied',
        status: 'rechazado',
        severity: 'info',
        metadata: {
          statusDetail: 'cc_rejected_call_for_authorize',
          providerStatus: 'rejected',
          externalPaymentId: '9988776655',
        },
      }),
      context: { request: [], actorBefore: [], actorAfter: [], entity: [] },
    })

    renderDialog()

    expect(await screen.findByText('El banco pide autorización expresa')).toBeTruthy()
    expect(screen.getByText(/llamar a su banco/)).toBeTruthy()
    expect(screen.getByText('cc_rejected_call_for_authorize')).toBeTruthy()
  })

  it('sin error no dibuja un bloque de falla vacío', async () => {
    fetchContext.mockResolvedValue({
      event: row({ action: 'account.created', severity: 'success', metadata: { roleKey: 'plu_arg' } }),
      context: { request: [], actorBefore: [], actorAfter: [], entity: [] },
    })

    renderDialog()
    await waitFor(() => expect(fetchContext).toHaveBeenCalled())

    expect(document.querySelector('.audit-detail__block--failure')).toBeNull()
  })
})
