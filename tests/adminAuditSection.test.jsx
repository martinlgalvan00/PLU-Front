import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../src/lib/credentialQr.js', () => ({
  buildCredentialUrl: ({ code }) => `https://plu-arg.com/?credencial=${code}`,
  generateCredentialQr: vi.fn(async () => 'data:image/png;base64,QR'),
}))

const { fetchAuditEntries, fetchAuditFacets, fetchAuditOverview, normalizeAuditEntry } = await import(
  '../src/services/auditService.js'
)
const { getMembershipCredential } = await import('../src/services/athleteApi.js')
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

  it('visibiliza las incidencias de emails y afiliaciones en el resumen', async () => {
    fetchAuditOverview.mockResolvedValue(healthyOverview({
      status: 'attention',
      emailAttention: 2,
      activeMembershipsWithoutConfirmation: 1,
      approvedOrdersWithoutActiveMembership: 1,
    }))
    fetchAuditFacets.mockResolvedValue({ actions: [], entityTypes: [], actorTypes: [] })
    fetchAuditEntries.mockResolvedValue({ entries: [], nextCursor: null })

    renderWithI18n(<AuditSection />)

    expect(await screen.findByText('Requiere revisión')).toBeTruthy()
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
    expect(screen.getByText(/1 órdenes aprobadas sin afiliación activa/)).toBeTruthy()
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
