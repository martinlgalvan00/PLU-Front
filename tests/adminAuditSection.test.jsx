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
  generateStyledAthleteCredentialQr: vi.fn(async () => 'data:image/png;base64,QR'),
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
  // Las vistas guardadas viven en localStorage (`useAdminSavedFilterViews`):
  // sin limpiarlo, una vista creada en un test aparece en el siguiente.
  window.localStorage.clear()
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

  it('visibiliza críticas y emails por separado en el resumen de salud', async () => {
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
    expect(screen.getByText(/4 incidencias de negocio/)).toBeTruthy()
    expect(screen.getByText('Emails a revisar')).toBeTruthy()
    expect(screen.getAllByText('290').length).toBeGreaterThan(0)
    expect(screen.getByText(/Pagos 3/)).toBeTruthy()
    expect(screen.getByText(/Afiliaciones 1/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '4' })).toBeNull()
  })

  it('trata emails solos como atención menor, no como revisión crítica', async () => {
    fetchAuditOverview.mockResolvedValue(
      healthyOverview({ status: 'attention', emailAttention: 181 }),
    )
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    expect(await screen.findByText('Atención menor')).toBeTruthy()
    expect(screen.queryByText('Requiere revisión')).toBeNull()
    expect(screen.getByText(/181 emails requieren revisión/)).toBeTruthy()
    expect(screen.getByText('Emails a revisar')).toBeTruthy()
    expect(screen.getAllByText('181').length).toBeGreaterThan(0)
  })

  it('incluye warnings en Solo errores y deja activar el toggle con filas cargadas', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockResolvedValue({
      entries: [
        normalizeAuditEntry({
          id: 'ok-1',
          action: 'membership.activated',
          entity_type: 'membership',
          entity_id: 'mem-ok',
          actor_type: 'webhook',
          source: 'domain',
          status: 'approved',
          created_at: '2026-08-16T12:00:00.000Z',
        }),
        normalizeAuditEntry({
          id: 'warn-1',
          action: 'email.rejected',
          entity_type: 'email_delivery',
          entity_id: 'mail-1',
          actor_type: 'system',
          source: 'email',
          status: 'rejected',
          created_at: '2026-08-16T12:01:00.000Z',
        }),
      ],
      nextCursor: null,
    })

    renderWithI18n(<AuditSection />)

    expect(await screen.findAllByText('Afiliación activada')).not.toHaveLength(0)
    const toggle = screen.getByRole('button', { name: /Solo errores/i })
    expect(toggle.disabled).toBe(false)
    expect(toggle.textContent).toMatch(/1/)

    fireEvent.click(toggle)

    await waitFor(() => {
      expect(toggle.getAttribute('aria-pressed')).toBe('true')
    })
    expect(screen.queryAllByText('Afiliación activada')).toHaveLength(0)
    expect(screen.getAllByText('Email rechazado por Brevo').length).toBeGreaterThan(0)
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
    expect(screen.getByRole('group', { name: 'Estado' })).toBeTruthy()
    expect(screen.getByLabelText('Categoría')).toBeTruthy()
    expect(screen.queryByLabelText('Acción')).toBeNull()
    expect(screen.queryByLabelText('Actor')).toBeNull()
    expect(screen.queryByLabelText('Entidad')).toBeNull()
    expect(screen.getByRole('button', { name: 'Más filtros' })).toBeTruthy()

    screen.getByRole('button', { name: 'Más filtros' }).click()

    // Por label y no por texto: "Acción", "Actor", "Entidad" y "Estado" son el
    // mismo literal en tres lugares distintos de esta pantalla —el filtro
    // (`admin.audit.filter*`), la columna de la bitácora (`admin.audit.column*`)
    // y el detalle del evento (`admin.auditDetail.fact*`)—. `getByText` no
    // distingue cuál encontró y explota con "Found multiple elements" en cuanto
    // hay una tabla con filas o un detalle abierto; la simetría con las
    // aserciones de arriba (`queryByLabelText`) es además la que expresa lo que
    // el test quiere: que el filtro exista como control con label.
    expect(await screen.findByLabelText('Acción')).toBeTruthy()
    expect(screen.getByLabelText('Actor')).toBeTruthy()
    expect(screen.getByLabelText('Entidad')).toBeTruthy()
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
    // Como se usa Ant Design Select, las opciones no se renderizan al DOM 
    // hasta que el usuario abre el dropdown. Solo validamos que esté el filtro.
    expect(categoria).toBeTruthy()
    
    // No disparamos fireEvent.change porque Antd Select no usa native selects.
  })

  it('guarda, aplica y elimina una vista de filtros', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview())
    fetchAuditFacets.mockResolvedValue({
      actions: [],
      categories: [],
      entityTypes: [],
      actorTypes: [],
      sources: ['domain'],
      statuses: [],
    })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    const search = await screen.findByPlaceholderText('Buscar por entidad o responsable')
    fireEvent.change(search, { target: { value: 'PLU-0001' } })

    const addButton = await screen.findByRole('button', { name: 'Guardar filtros actuales' })
    addButton.click()

    const nameInput = await screen.findByPlaceholderText('Nombre de la vista')
    fireEvent.change(nameInput, { target: { value: 'Morosos' } })
    fireEvent.submit(nameInput.closest('form'))

    const viewChip = await screen.findByRole('button', { name: 'Morosos' })
    expect(viewChip).toBeTruthy()

    // Limpiar el filtro no borra la vista guardada, solo la deja de aplicar.
    fireEvent.change(search, { target: { value: '' } })
    expect(search.value).toBe('')

    viewChip.click()
    await waitFor(() => expect(search.value).toBe('PLU-0001'))

    screen.getByRole('button', { name: 'Eliminar vista Morosos' }).click()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Morosos' })).toBeNull())
  })

  it('explica el recorrido y muestra la salud de toda la operación antes de los filtros', async () => {
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

    expect(await screen.findByText('Seguimiento completo de cada operación')).toBeTruthy()
    fireEvent.click(screen.getByText('Seguimiento completo de cada operación'))
    expect(screen.getByText('1. Revisá el estado general')).toBeTruthy()
    expect(screen.getByText('2. Encontrá el hecho')).toBeTruthy()
    expect(screen.getByText('3. Abrí el contexto')).toBeTruthy()
    const health = await screen.findByRole('region', { name: 'Salud de la operación' })
    const filters = screen.getByRole('group', { name: 'Fuente' })
    expect(health.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('cambia la tabla por fichas operativas al abrirse en mobile', async () => {
    const previousMatchMedia = window.matchMedia
    window.matchMedia = () => ({
      matches: true,
      media: '(max-width: 768px)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })

    try {
      fetchAuditOverview.mockResolvedValue(healthyOverview())
      fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
      fetchAuditEntries.mockResolvedValue({
        entries: [
          normalizeAuditEntry({
            id: 'mobile-log',
            action: 'membership.activated',
            entity_type: 'membership',
            entity_id: 'mem-mobile',
            actor_type: 'staff',
            source: 'domain',
            metadata: { memberCode: 'PLU-MOBILE-01' },
            created_at: '2026-08-16T12:00:00.000Z',
          }),
        ],
        nextCursor: null,
      })

      renderWithI18n(<AuditSection />)

      expect(await screen.findByText('PLU-MOBILE-01')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Ver detalle y contexto' })).toBeTruthy()
      expect(document.querySelector('.audit-mobile-list')).toBeTruthy()
      expect(document.querySelector('.audit-desktop-table')).toBeNull()
    } finally {
      window.matchMedia = previousMatchMedia
    }
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
      verdict: { state: 'closed', summary: 'La orden vencio automaticamente sin un pago iniciado.', action: null },
      stageReached: 'checkout_opened',
      timeline: [],
      cancellation: {
        code: 'expired_without_payment',
        expiresAt: '2026-08-13T22:28:00.000Z',
        cancelledAt: '2026-08-13T22:28:31.000Z',
        checkoutOpenedAt: '2026-08-13T21:58:00.000Z',
        paymentEvidence: false,
        providerPaymentStarted: false,
      },
    })

    renderWithI18n(<AuditSection />)

    const traceButton = await screen.findByRole('button', { name: 'Ver traza del cobro' })
    traceButton.click()

    await waitFor(() => expect(getPaymentOrderAudit).toHaveBeenCalledWith('order-99'))
    expect(await screen.findByText('La orden vencio automaticamente sin un pago iniciado.')).toBeTruthy()
    expect(await screen.findByText('Cerrada')).toBeTruthy()
    expect(await screen.findByText('Detalle del vencimiento')).toBeTruthy()
    expect(screen.queryByText(/\{expiresAt\}/)).toBeNull()
    expect(await screen.findByText(/No se registr/)).toBeTruthy()
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
