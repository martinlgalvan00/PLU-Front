import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

/**
 * Franja de trafico del tablero: la cifra protagonista es la concurrencia
 * ahora, no el acumulado del dia. Si el vivo falla, el dia sigue siendo
 * la lectura; si todo falla, la franja no se inventa.
 */

const summary = vi.fn()
const live = vi.fn()
const timeseries = vi.fn()

vi.mock('../src/services/analyticsReportService.js', () => ({
  fetchAnalyticsDashboardSummary: (...args) => summary(...args),
  fetchAnalyticsLive: (...args) => live(...args),
  fetchAnalyticsTimeseries: (...args) => timeseries(...args),
}))

const DashboardTrafficCard = (await import('../src/components/admin/DashboardTrafficCard.jsx'))
  .default

function renderCard(onNavigate = vi.fn()) {
  return {
    onNavigate,
    ...render(
      <I18nProvider>
        <MotionProvider>
          <DashboardTrafficCard onNavigate={onNavigate} />
        </MotionProvider>
      </I18nProvider>,
    ),
  }
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
  summary.mockResolvedValue({
    today: { visitors: 35, pageviews: 80, sessions: 40 },
    yesterday: { visitors: 54, pageviews: 90, sessions: 50 },
    last7: { visitors: 578, pageviews: 1200, sessions: 700 },
    previous7: { visitors: 790, sessions: 900 },
    peak: { day: '2026-08-20', visitors: 345, pageviews: 900 },
  })
  live.mockResolvedValue({
    visitors: 3,
    peakToday: 12,
    visitorsToday: 35,
  })
  timeseries.mockResolvedValue({
    series: [
      { day: '2026-08-20', visitors: 345 },
      { day: '2026-08-21', visitors: 120 },
      { day: '2026-08-22', visitors: 80 },
      { day: '2026-09-02', visitors: 35 },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('franja de trafico del tablero', () => {
  it('pone la concurrencia en vivo como cifra principal y deja el dia como contexto', async () => {
    renderCard()

    const region = await screen.findByRole('region', { name: 'Visitas del sitio' })
    expect(region.textContent).toMatch(/en el sitio/)
    expect(region.textContent).toMatch(/3/)
    expect(region.textContent).toMatch(/35 hoy/)
    expect(region.textContent).toMatch(/54 ayer/)
    expect(region.textContent).not.toMatch(/vs ayer/)
    expect(region.querySelector('.admin-ops__traffic-delta')).toBeNull()
    expect(region.textContent).not.toMatch(/personas visitaron el sitio hoy/)
  })

  it('dibuja la curva reciente y el recorte historico sin una grilla de KPIs', async () => {
    renderCard()

    const spark = await screen.findByRole('img', { name: /Visitantes diarios/ })
    expect(spark.querySelector('.admin-ops__traffic-spark-line')).toBeTruthy()
    expect(spark.querySelector('circle')).toBeNull()
    expect(spark.parentElement.querySelector('.admin-ops__traffic-spark-dot')).toBeTruthy()
    expect(screen.queryByText('Últimos 7 días')).toBeNull()
    expect(screen.queryByText('Ayer')).toBeNull()

    const region = screen.getByRole('region', { name: 'Visitas del sitio' })
    expect(region.textContent).toMatch(/578 en 7 días/)
    expect(region.textContent).toMatch(/Récord 345/)
    expect(region.textContent).toMatch(/Pico de hoy 12/)
  })

  it('si el vivo falla, el dia queda como lectura y la franja no desaparece', async () => {
    live.mockRejectedValue(new Error('live down'))
    renderCard()

    const region = await screen.findByRole('region', { name: 'Visitas del sitio' })
    expect(region.textContent).toMatch(/personas hoy/)
    expect(region.textContent).not.toMatch(/en el sitio/)
    expect(region.querySelector('.admin-ops__traffic-pulse')).toBeNull()
  })

  it('no inventa la franja si todas las lecturas fallan', async () => {
    summary.mockRejectedValue(new Error('summary down'))
    live.mockRejectedValue(new Error('live down'))
    timeseries.mockRejectedValue(new Error('series down'))

    const { container } = renderCard()
    await waitFor(() => {
      expect(summary).toHaveBeenCalled()
      expect(live).toHaveBeenCalled()
    })
    expect(container.querySelector('.admin-ops__traffic')).toBeNull()
  })

  it('abre el informe desde la unica accion de la franja', async () => {
    const { onNavigate } = renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver analítica' }))
    expect(onNavigate).toHaveBeenCalledWith('analytics')
  })
})
