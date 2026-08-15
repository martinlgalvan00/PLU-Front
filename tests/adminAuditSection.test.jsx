import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

// jsdom no implementa matchMedia y `AdminListSection` la usa para colapsar el
// resumen en viewports angostos. Se responde "desktop" para ejercitar el
// layout completo.
beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

/**
 * Render real (jsdom) de las superficies nuevas del panel. No reemplaza la QA
 * visual, pero cierra la clase de bug que este repo ya tuvo: código que parece
 * correcto y explota al montarse (prop faltante, import mal resuelto, clave de
 * i18n que no existe).
 */

vi.mock('../src/services/auditService.js', async () => {
  const actual = await vi.importActual('../src/services/auditService.js')
  return {
    ...actual,
    fetchAuditEntries: vi.fn(),
    fetchAuditFacets: vi.fn(),
    fetchAuditOverview: vi.fn(),
  }
})

vi.mock('../src/services/athleteApi.js', () => ({
  getMembershipCredential: vi.fn(),
  rotateMembershipQrToken: vi.fn(),
}))

vi.mock('../src/services/paymentService.js', () => ({
  getPaymentOrderAudit: vi.fn(),
}))

vi.mock('../src/lib/credentialQr.js', () => ({
  buildCredentialUrl: ({ code }) => `https://plu-arg.com/?credencial=${code}`,
  generateCredentialQr: vi.fn(async () => 'data:image/png;base64,QR'),
}))

const { fetchAuditEntries, fetchAuditFacets, fetchAuditOverview, normalizeAuditEntry } = await import(
  '../src/services/auditService.js'
)
const { getMembershipCredential } = await import('../src/services/athleteApi.js')
const { getPaymentOrderAudit } = await import('../src/services/paymentService.js')
const AuditSection = (await import('../src/pages/admin/AuditSection.jsx')).default
const AdminMembershipCredential = (
  await import('../src/components/admin/AdminMembershipCredential.jsx')
).default

function renderWithI18n(ui) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

afterEach(() => {
  // Sin `globals: true` en vitest.config.js, Testing Library no registra su
  // cleanup automático: sin esto cada render se acumula en el body y las
  // consultas de un test encuentran el DOM del anterior.
  cleanup()
  vi.resetAllMocks()
})

function healthyOverview(overrides = {}) {
  return {
    status: 'healthy',
    eventsLast24h: 12,
    emailsDeliveredLast24h: 4,
    emailsRetrying: 0,
    emailAttention: 0,
    paymentAttention: 0,
    activeMembershipsWithoutConfirmation: 0,
    approvedOrdersWithoutActiveMembership: 0,
    ...overrides,
  }
}

describe('sección de auditoría', () => {
  it('muestra la bitácora con la acción traducida y el detalle operativo', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: ['membership.activated'],
      entityTypes: ['membership'],
      actorTypes: ['webhook'],
    })
    fetchAuditEntries.mockResolvedValue({
      entries: [
        normalizeAuditEntry({
          id: 'log-1',
          action: 'membership.activated',
          entity_type: 'membership',
          entity_id: 'mem-1',
          actor_type: 'webhook',
          actor_id: 'mp-8891',
          metadata: { memberCode: 'PLU-ARG-2026-014' },
          created_at: '2026-08-02T12:00:00.000Z',
        }),
      ],
      nextCursor: null,
    })

    renderWithI18n(<AuditSection />)

    // Se espera por el detalle y no por la acción: la acción también aparece
    // como opción del filtro, que carga antes que la tabla.
    // `DataTable` emite la tabla y las cards mobile a la vez y las alterna por
    // CSS, así que cada celda aparece dos veces en el DOM: se consulta en
    // plural. Se espera por el detalle y no por la acción, que también
    // aparece como opción del filtro y carga antes que la tabla.
    expect(await screen.findAllByText('PLU-ARG-2026-014')).not.toHaveLength(0)
    expect(screen.getAllByText('Afiliación activada').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mem-1').length).toBeGreaterThan(0)
    // El origen se traduce: `webhook` no le dice nada a un operador.
    expect(screen.getAllByText('Mercado Pago').length).toBeGreaterThan(0)
    // Y el campo de metadata también: `memberCode` tampoco.
    expect(screen.getAllByText('Código').length).toBeGreaterThan(0)
  })

  it('explica el webhook fallido con el error completo y los ids atrás', async () => {
    const error =
      'Si quieres conocer los motivos del rechazo, por favor ingresá a tu cuenta de Mercado Pago.'
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: ['payment_webhook.failed'],
      entityTypes: ['payment_integration_event'],
      actorTypes: ['webhook'],
    })
    fetchAuditEntries.mockResolvedValue({
      entries: [
        normalizeAuditEntry({
          id: 'log-wh',
          action: 'payment_webhook.failed',
          entity_type: 'payment_integration_event',
          entity_id: '4659014d-e322-4f7b-acf5-3ff4191f3c4c',
          actor_type: 'webhook',
          actor_id: '777:payment.updated:2026-08-14T00:27:18.425Z',
          source: 'payment',
          metadata: { attempt: 5, error },
          created_at: '2026-08-13T21:58:44.000Z',
        }),
      ],
      nextCursor: null,
    })

    renderWithI18n(<AuditSection />)

    expect(await screen.findAllByText(error)).not.toHaveLength(0)
    expect(screen.getAllByText('Webhook de pago fallido').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Intento').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Referencias técnicas').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Pagos · Mercado Pago/).length).toBeGreaterThan(0)
  })

  it('muestra un vacío legible cuando no hay registros', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    expect(
      await screen.findByText('No hay registros que coincidan con los filtros'),
    ).toBeTruthy()
  })

  it('informa el error en vez de quedarse cargando para siempre', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockRejectedValue(new Error('Supabase caído'))

    renderWithI18n(<AuditSection />)

    expect(await screen.findByText('Supabase caído')).toBeTruthy()
  })

  it('visibiliza las incidencias de emails, pagos y afiliaciones en el resumen', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview({
      status: 'attention',
      emailAttention: 290,
      paymentAttention: 3,
      activeMembershipsWithoutConfirmation: 1,
      approvedOrdersWithoutActiveMembership: 0,
    }))
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    expect(await screen.findByText('Requiere revisión')).toBeTruthy()
    expect(screen.getAllByText('294').length).toBeGreaterThan(0)
    expect(screen.getByText('Emails')).toBeTruthy()
    expect(screen.getByText('290')).toBeTruthy()
    expect(screen.getByText('Pagos')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('Afiliaciones')).toBeTruthy()
    expect(screen.getByText('Órdenes aprobadas sin afiliación activa')).toBeTruthy()
    expect(screen.getByText('Afiliaciones activas sin confirmación entregada (30 d)')).toBeTruthy()
    // El "1" aparece en el subtotal de afiliaciones y en el detalle de confirmación.
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2)
  })

  it('deja fuente y estado a la vista y pliega acción, actor y entidad', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: ['membership.activated'],
      entityTypes: ['membership'],
      actorTypes: ['webhook'],
      sources: ['domain', 'email', 'payment'],
      statuses: ['partial', 'failed'],
    })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    expect(await screen.findByRole('button', { name: 'Negocio' })).toBeTruthy()
    expect(screen.getByLabelText('Estado')).toBeTruthy()
    expect(screen.queryByLabelText('Acción')).toBeNull()
    expect(screen.queryByLabelText('Actor')).toBeNull()
    expect(screen.queryByLabelText('Entidad')).toBeNull()
    expect(screen.getByRole('button', { name: 'Más filtros' })).toBeTruthy()

    screen.getByRole('button', { name: 'Más filtros' }).click()

    expect(await screen.findByLabelText('Acción')).toBeTruthy()
    expect(screen.getByLabelText('Actor')).toBeTruthy()
    expect(screen.getByLabelText('Entidad')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Estado' }).textContent).toMatch(/Parcial/)
  })

  /**
   * El filtro que resuelve el problema de fondo: la bitácora asienta el mismo
   * hecho con dos nombres según quién lo escriba (`payment.webhook_failed` de
   * la app, `payment_webhook.failed` del trigger). El filtro de acción exacta
   * ofrecía las dos variantes sin decir que eran lo mismo, así que buscar "qué
   * pasó con los webhooks" devolvía la mitad sin avisar que faltaba algo.
   *
   * Queda a la vista y no en "Más filtros": es por donde conviene empezar a
   * buscar, y el de acción exacta sirve recién cuando ya se sabe qué se busca.
   */
  it('ofrece el filtro por categoría a la vista y lo manda al backend', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: ['payment.webhook_failed', 'payment_webhook.failed'],
      categories: ['acceso', 'webhook', 'cobro'],
      entityTypes: [],
      actorTypes: [],
      sources: ['payment'],
      statuses: ['failed'],
    })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    const categoria = await screen.findByLabelText('Categoría')
    expect(categoria).toBeTruthy()
    // Solo las categorías presentes en la bitácora: ofrecer una que devolvería
    // cero filas es peor que no ofrecerla.
    expect(categoria.textContent).toMatch(/Webhooks de pago/)
    expect(categoria.textContent).not.toMatch(/Correos/)

    fireEvent.change(categoria, { target: { value: 'webhook' } })

    await waitFor(() => {
      expect(fetchAuditEntries).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'webhook' }),
      )
    })
  })

  it('muestra la salud del flujo antes de los filtros', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview({ status: 'attention', emailAttention: 2 }))
    fetchAuditFacets.mockResolvedValue({
      actions: [],
      entityTypes: [],
      actorTypes: [],
      sources: ['domain'],
      statuses: [],
    })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    const health = await screen.findByRole('region', { name: 'Salud del flujo de afiliación' })
    const filters = screen.getByRole('group', { name: 'Fuente' })
    expect(health.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('abre la traza completa del cobro para una orden de pago fallida', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: ['payment_attempt.failed'],
      entityTypes: ['athlete_payment_order'],
      actorTypes: ['system'],
    })
    fetchAuditEntries.mockResolvedValue({
      entries: [
        normalizeAuditEntry({
          id: 'log-order',
          action: 'payment_attempt.failed',
          entity_type: 'athlete_payment_order',
          entity_id: 'order-99',
          actor_type: 'system',
          severity: 'danger',
          source: 'payment',
          metadata: { attempt: 2, error: { message: 'El monto no coincide con la preferencia.' } },
          created_at: '2026-08-13T21:58:44.000Z',
        }),
      ],
      nextCursor: null,
    })
    getPaymentOrderAudit.mockResolvedValue({
      verdict: { state: 'blocked', summary: 'El cobro se cortó por una falla.', action: null },
      stageReached: 'provider_submitted',
      timeline: [],
    })

    renderWithI18n(<AuditSection />)

    const traceButton = await screen.findByRole('button', { name: 'Ver traza del cobro' })
    traceButton.click()

    await waitFor(() => expect(getPaymentOrderAudit).toHaveBeenCalledWith('order-99'))
    expect(await screen.findByText('El cobro se cortó por una falla.')).toBeTruthy()
  })
})

describe('credencial en el detalle del atleta', () => {
  it('renderiza el QR, el código y la vigencia', async () => {
    getMembershipCredential.mockResolvedValue({
      membership: {
        id: 'mem-1',
        status: 'activa',
        memberCode: 'PLU-ARG-2026-014',
        qrToken: '3f0f2d16-0000-4000-8000-000000000001',
        expirationDate: '2027-08-02',
      },
      athlete: { id: 'ath-1', fullName: 'Ana Torres' },
    })

    renderWithI18n(<AdminMembershipCredential membershipId="mem-1" />)

    // `DataTable` emite la tabla y las cards mobile a la vez y las alterna por
    // CSS, así que cada celda aparece dos veces en el DOM: se consulta en
    // plural. Se espera por el detalle y no por la acción, que también
    // aparece como opción del filtro y carga antes que la tabla.
    expect(await screen.findAllByText('PLU-ARG-2026-014')).not.toHaveLength(0)
    await waitFor(() =>
      expect(screen.getByAltText('Código QR de la credencial del socio')).toBeTruthy(),
    )
  })

  it('no ofrece reemitir sin permiso de escritura de afiliaciones', async () => {
    getMembershipCredential.mockResolvedValue({
      membership: { id: 'mem-1', status: 'activa', memberCode: 'PLU-ARG-2026-014', qrToken: 'tok' },
      athlete: { id: 'ath-1', fullName: 'Ana Torres' },
    })

    renderWithI18n(<AdminMembershipCredential membershipId="mem-1" canRotate={false} />)

    await screen.findByText('PLU-ARG-2026-014')
    expect(screen.queryByText('Reemitir credencial')).toBeNull()
  })

  it('pide confirmación antes de invalidar el QR vigente', async () => {
    getMembershipCredential.mockResolvedValue({
      membership: { id: 'mem-1', status: 'activa', memberCode: 'PLU-ARG-2026-014', qrToken: 'tok' },
      athlete: { id: 'ath-1', fullName: 'Ana Torres' },
    })

    renderWithI18n(<AdminMembershipCredential membershipId="mem-1" canRotate />)

    const trigger = await screen.findByText('Reemitir credencial')
    trigger.closest('button').click()

    await waitFor(() =>
      expect(
        screen.getByText(
          'El QR actual deja de funcionar en el acto. El socio tiene que volver a descargar su credencial.',
        ),
      ).toBeTruthy(),
    )
  })

  it('avisa cuando el atleta no tiene afiliación emitida', () => {
    renderWithI18n(<AdminMembershipCredential membershipId={null} />)
    expect(screen.getByText('Este atleta todavía no tiene una afiliación emitida.')).toBeTruthy()
  })
})
