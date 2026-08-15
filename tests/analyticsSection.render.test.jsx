import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Lo que este render protege es la geometría del mapa de calor y el límite del
 * dato identificado.
 *
 * El mapa dibujaba una grilla cuadrada con `preserveAspectRatio="none"` sobre
 * coordenadas normalizadas de un documento cuatro veces más alto que ancho: los
 * focos no caían donde la gente había clickeado. Un bug así no se ve leyendo el
 * código del SVG, se ve midiendo la caja.
 */

const overview = vi.fn()
const pages = vi.fn()
const flows = vi.fn()
const funnel = vi.fn()
const elements = vi.fn()
const heatmap = vi.fn()
const journey = vi.fn()
const operationalSummary = vi.fn()
const operationalAlerts = vi.fn()
const failureReasons = vi.fn()

vi.mock('../src/services/analyticsReportService.js', async () => {
  const actual = await vi.importActual('../src/services/analyticsReportService.js')
  return {
    ...actual,
    fetchAnalyticsOverview: (...args) => overview(...args),
    fetchAnalyticsPages: (...args) => pages(...args),
    fetchAnalyticsFlows: (...args) => flows(...args),
    fetchAnalyticsFunnel: (...args) => funnel(...args),
    fetchAnalyticsElements: (...args) => elements(...args),
    fetchAnalyticsHeatmap: (...args) => heatmap(...args),
    fetchAnalyticsOperationalSummary: (...args) => operationalSummary(...args),
    fetchAnalyticsOperationalAlerts: (...args) => operationalAlerts(...args),
    fetchAthleteJourney: (...args) => journey(...args),
  }
})

vi.mock('../src/services/paymentService.js', () => ({
  getPaymentFailureReasons: (...args) => failureReasons(...args),
}))

const AnalyticsSection = (await import('../src/pages/admin/AnalyticsSection.jsx')).default

const ATHLETES = [{ id: 'a-1', fullName: 'Camila Ruiz', documentId: '30111222' }]

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <AnalyticsSection athletes={ATHLETES} {...props} />
    </I18nProvider>,
  )
}

async function openTab(name) {
  fireEvent.click(await screen.findByRole('tab', { name }))
}

beforeAll(() => {
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

beforeEach(() => {
  overview.mockResolvedValue({ visitors: 40, pageviews: 120, sessions: 55, bounceRate: 0.4 })
  pages.mockResolvedValue([{ path: '/', pageviews: 90, visitors: 30, clicks: 12, exits: 5 }])
  flows.mockResolvedValue([])
  funnel.mockResolvedValue([
    { step_index: 1, step_name: 'landing_view', visitors: 30 },
    { step_index: 2, step_name: 'membership_view', visitors: 12 },
  ])
  elements.mockResolvedValue([
    {
      element_selector: '#cta-afiliarme',
      label: 'Afiliarme',
      clicks: 91,
      visitors: 44,
      paths: 3,
      sample_path: '/',
    },
  ])
  heatmap.mockResolvedValue({
    path: '/',
    grid: 40,
    total: 12,
    max: 4,
    aspectRatio: 4.236,
    aspectSamples: 12,
    cells: [{ cell_x: 12, cell_y: 30, weight: 4 }],
    elements: [],
  })
  journey.mockResolvedValue({
    athleteId: 'a-1',
    summary: { sessions: 2, pageviews: 9, clicks: 4, conversions: 1 },
    pages: [{ path: '/afiliarse', pageviews: 5 }],
    elements: [{ element_selector: '#cta-afiliarme', label: 'Afiliarme', clicks: 3 }],
    timeline: [],
  })
  operationalSummary.mockResolvedValue({
    engagedVisitors: 18,
    access: { total: 7, byGate: [] },
    keyActions: [],
  })
  operationalAlerts.mockResolvedValue([])
  failureReasons.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('cabecera y cifras', () => {
  it('muestra el período y las cifras en una sola ficha', async () => {
    overview.mockResolvedValue({
      visitors: 40,
      pageviews: 120,
      sessions: 55,
      bounceRate: 0.4,
      avgDurationSeconds: 317,
      interactions: 5011,
    })
    renderSection()

    expect(await screen.findByRole('button', { name: 'Últimos 30 días' })).toBeTruthy()
    const pulse = document.querySelector('.admin-analytics__pulse')
    expect(pulse).toBeTruthy()
    expect(pulse.textContent).toContain('Visitantes únicos')
    expect(pulse.textContent).toContain('40')

    const secondary = pulse.querySelector('.admin-analytics__metrics--secondary')
    expect(secondary).toBeTruthy()
    expect(secondary.textContent).toContain('Sesiones')
    expect(secondary.textContent).toContain('55')
    expect(secondary.textContent).toContain('Duración promedio')
    expect(secondary.textContent).toContain('5m 17s')
    expect(secondary.textContent).toContain('Interacciones')
    expect(secondary.textContent).toContain('5.011')
  })
})

describe('comparación entre períodos', () => {
  it('muestra la variación de cada métrica contra el período inmediatamente anterior', async () => {
    // El overview se pide dos veces: período actual y el tramo previo de igual
    // largo. `mockResolvedValueOnce` distingue una llamada de la otra por orden.
    overview.mockReset()
    overview
      .mockResolvedValueOnce({ visitors: 60, pageviews: 120, sessions: 55, bounceRate: 0.4 })
      .mockResolvedValueOnce({ visitors: 40, pageviews: 120, sessions: 40, bounceRate: 0.2 })

    renderSection()

    const pulse = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__pulse')
      expect(node.textContent).toContain('60')
      return node
    })
    // (60 - 40) / 40 = +50%; sin cambio en pageviews no debería marcar variación.
    expect(pulse.textContent).toContain('+50%')
  })

  it('no muestra variación cuando no hay período anterior con el que comparar', async () => {
    overview.mockReset()
    overview
      .mockResolvedValueOnce({ visitors: 60, pageviews: 120, sessions: 55, bounceRate: 0.4 })
      .mockResolvedValueOnce({ visitors: 0, pageviews: 0, sessions: 0, bounceRate: 0 })

    renderSection()

    const pulse = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__pulse')
      expect(node.textContent).toContain('60')
      return node
    })
    expect(document.querySelector('.admin-analytics__metric-delta')).toBeNull()
  })
})

describe('motivos de rechazo de pago', () => {
  it('sin permiso de pagos ni siquiera se pide', async () => {
    renderSection({ canViewPaymentFailures: false })
    await waitFor(() => expect(overview).toHaveBeenCalled())

    expect(failureReasons).not.toHaveBeenCalled()
    expect(screen.queryByText('Motivos de rechazo de pago')).toBeNull()
  })

  it('con permiso muestra el ranking de motivos, ordenado como llega del backend', async () => {
    failureReasons.mockResolvedValue([
      { code: 'AMOUNT_MISMATCH', title: 'El monto no coincide con la preferencia', severity: 'blocker', count: 5 },
      { code: 'CARD_DECLINED', title: 'Tarjeta rechazada por el banco', severity: 'expected', count: 2 },
    ])

    renderSection({ canViewPaymentFailures: true })

    expect(await screen.findByText('El monto no coincide con la preferencia')).toBeTruthy()
    expect(screen.getByText('Tarjeta rechazada por el banco')).toBeTruthy()
    expect(screen.getByText('5 casos')).toBeTruthy()
  })

  it('sin fallas en el período muestra el estado vacío', async () => {
    renderSection({ canViewPaymentFailures: true })

    await waitFor(() => expect(failureReasons).toHaveBeenCalled())
    expect(
      await screen.findByText('Sin fallas de pago registradas en este período.'),
    ).toBeTruthy()
  })
})

describe('geometría del mapa de calor', () => {
  it('la caja toma el alto real del documento, no un cuadrado', async () => {
    renderSection()
    await openTab('Páginas')

    const svg = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__heatmap svg')
      expect(node).toBeTruthy()
      return node
    })

    // 40 de ancho × 40 × 4.236 de alto: la proporción de la página medida.
    expect(svg.getAttribute('viewBox')).toBe(`0 0 40 ${40 * 4.236}`)
    // `none` estiraba la grilla hasta llenar la caja, que era justamente el bug.
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMin meet')

    const rect = svg.querySelector('rect')
    // La celda se escala en Y para cubrir su franja del documento.
    expect(rect.getAttribute('height')).toBe('4.236')
    expect(rect.getAttribute('y')).toBe(String(30 * 4.236))
  })

  it('sin proporción guardada cae a 1:1 y lo avisa en vez de inventar una forma', async () => {
    heatmap.mockResolvedValue({
      path: '/',
      grid: 40,
      total: 3,
      max: 2,
      aspectRatio: null,
      aspectSamples: 0,
      cells: [{ cell_x: 1, cell_y: 2, weight: 2 }],
      elements: [],
    })

    renderSection()
    await openTab('Páginas')

    const svg = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__heatmap svg')
      expect(node).toBeTruthy()
      return node
    })
    expect(svg.getAttribute('viewBox')).toBe('0 0 40 40')
    expect(document.querySelector('.admin-analytics__heatmap figcaption').textContent).toContain(
      'sin proporción de página guardada',
    )
  })

  it('cambiar de dispositivo vuelve a pedir el mapa con ese filtro', async () => {
    renderSection()
    await openTab('Páginas')
    await waitFor(() => expect(heatmap).toHaveBeenCalled())

    const mobileButton = await screen.findByRole('button', { name: 'Mobile' })
    mobileButton.click()

    await waitFor(() =>
      expect(heatmap).toHaveBeenCalledWith(expect.objectContaining({ deviceType: 'mobile' })),
    )
  })
})

describe('lo más usado', () => {
  it('muestra clicks y personas, y agrupa cuando el elemento vive en varias rutas', async () => {
    renderSection()
    await waitFor(() => expect(overview).toHaveBeenCalled())
    expect(elements).not.toHaveBeenCalled()
    expect(flows).not.toHaveBeenCalled()

    await openTab('Uso')

    const ranking = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__ranking')
      expect(node).toBeTruthy()
      return node
    })
    expect(ranking.textContent).toContain('Afiliarme')
    expect(ranking.textContent).toContain('91')
    expect(ranking.textContent).toContain('44 personas')
    expect(ranking.textContent).toContain('en 3 rutas')
  })
})

describe('límite del recorrido identificado', () => {
  it('no se ofrece sin el permiso de identidad', async () => {
    renderSection({ canViewIdentity: false })
    await waitFor(() => expect(overview).toHaveBeenCalled())
    expect(screen.queryByRole('tab', { name: 'Atleta' })).toBeNull()
    expect(document.querySelector('.admin-analytics__journey-search')).toBeNull()
    expect(journey).not.toHaveBeenCalled()
  })

  it('con permiso avisa que la consulta queda registrada antes de buscar', async () => {
    renderSection({ canViewIdentity: true })
    await openTab('Atleta')

    const notice = await waitFor(() => {
      const node = document.querySelector('.admin-analytics__notice')
      expect(node).toBeTruthy()
      return node
    })
    expect(notice.textContent).toContain('queda registrada en Auditoría')
    // No carga sola: hay que elegir a alguien.
    expect(journey).not.toHaveBeenCalled()
  })
})

describe('alertas accionables', () => {
  it('lleva la alerta a la orden de pagos que debe resolverse', async () => {
    const onNavigate = vi.fn()
    operationalAlerts.mockResolvedValue([{
      kind: 'transfer_overdue',
      entity_id: 'order-1',
      subject: 'MORD-1',
      detail: 'Comprobante pendiente de validación por más de 48 horas',
    }])
    renderSection({ onNavigate })

    fireEvent.click(await screen.findByRole('button', { name: /revisar y resolver/i }))
    expect(onNavigate).toHaveBeenCalledWith('payments', 'order-1')
  })
})
