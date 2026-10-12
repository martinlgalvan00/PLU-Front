// Montaje compartido de las stories de Roles, Auditoría y Analítica.
//
// Una story que solo importa `admin.css` y no monta el shell da una captura
// engañosa (sidebar de antd, tablas claras, pestañas truncadas que no existen en
// el panel real). Acá se monta lo mismo que `AdminPage`: `AppConfigProvider` >
// `AdminShell` > `.admin-page`, las mismas hojas y `data-surface="admin"`.
//
// Solo lo importan archivos *.stories.jsx: no entra al bundle de la app.
import { useEffect } from 'react'
import AdminShell from '../../components/layout/AdminShell.jsx'
import AdminActionToasts from '../../components/admin/AdminActionToasts.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-dashboard-bento.css'
import '../../styles/pages/admin-audit.css'
import '../../styles/pages/admin-analytics.css'
import '../../styles/pages/admin-pricing.css'
import '../../styles/pages/admin-event-console.css'
import '../../styles/pages/admin-modals.css'
import '../../styles/pages/admin-staff-applications.css'
import {
  PREVIEW_ANALYTICS,
  PREVIEW_AUDIT_FACETS,
  PREVIEW_AUDIT_OVERVIEW_ATTENTION,
  PREVIEW_AUDIT_ROWS,
  previewTimeseries,
} from './adminPreviewFixtures.js'

const ALLOWED_SECTIONS = [
  'dashboard',
  'events',
  'people',
  'payments',
  'audit',
  'analytics',
  'users',
  'roles',
]

export function AdminPreviewShell({ section, children }) {
  useEffect(() => {
    document.documentElement.dataset.surface = 'admin'
    return () => {
      delete document.documentElement.dataset.surface
    }
  }, [])

  return (
    <AppConfigProvider>
      <AdminShell
        activeSection={section}
        roleLabel="Super Admin"
        onSectionChange={() => {}}
        onExit={() => {}}
        navBadges={{}}
        allowedSections={ALLOWED_SECTIONS}
      >
        <div className="admin-page">{children}</div>
        <AdminActionToasts />
      </AdminShell>
    </AppConfigProvider>
  )
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Doble de los endpoints de lectura de Auditoría y Analítica. Intercepta
 * `fetch` en vez de reemplazar los services: el componente ejercita el camino
 * real (service → normalización → estado). Devuelve la función que lo restaura.
 *
 * `overrides` pisa piezas puntuales: `auditRows`, `auditOverview`, `timeseries`.
 */
export function installAdminMockApi(overrides = {}) {
  const originalFetch = globalThis.fetch
  const auditRows = overrides.auditRows ?? PREVIEW_AUDIT_ROWS
  const auditOverview = overrides.auditOverview ?? PREVIEW_AUDIT_OVERVIEW_ATTENTION

  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    const params = new URL(url, 'http://localhost').searchParams
    const days = Number(params.get('days') ?? 30)

    const contextMatch = url.match(/\/api\/audit\/([^/?]+)\/context/)
    if (contextMatch) {
      const event = auditRows.find((row) => row.id === decodeURIComponent(contextMatch[1]))
      return json({
        event,
        context: {
          request: [],
          actorBefore: auditRows.slice(3, 5),
          actorAfter: auditRows.slice(0, 2),
          entity: auditRows.slice(5, 7),
        },
      })
    }
    if (url.includes('/api/audit/facets')) return json(PREVIEW_AUDIT_FACETS)
    if (url.includes('/api/audit/overview')) return json(auditOverview)
    if (/\/api\/audit(\?|$)/.test(url)) return json({ entries: auditRows, nextCursor: null })

    if (url.includes('/api/payments/operations/failure-reasons')) {
      return json({ reasons: PREVIEW_ANALYTICS.failureReasons })
    }
    if (url.includes('/api/payments/operations')) {
      return json({ summary: { health: { healthy: true } }, blockers: [] })
    }

    if (url.includes('/api/analytics/overview')) {
      return json(
        params.get('from') ? PREVIEW_ANALYTICS.previousOverview : PREVIEW_ANALYTICS.overview,
      )
    }
    if (url.includes('/api/analytics/timeseries')) {
      return json(overrides.timeseries ?? previewTimeseries(days))
    }
    if (url.includes('/api/analytics/pages')) return json({ pages: PREVIEW_ANALYTICS.pages })
    if (url.includes('/api/analytics/funnel')) return json({ steps: PREVIEW_ANALYTICS.funnel })
    if (url.includes('/api/analytics/access')) return json(PREVIEW_ANALYTICS.access)
    if (url.includes('/api/analytics/operational-summary')) {
      return json(PREVIEW_ANALYTICS.operational)
    }
    if (url.includes('/api/analytics/operational-alerts')) {
      return json({ alerts: PREVIEW_ANALYTICS.alerts })
    }
    if (url.includes('/api/analytics/live')) return json(PREVIEW_ANALYTICS.live)
    if (url.includes('/api/analytics/flows')) return json({ flows: PREVIEW_ANALYTICS.flows })
    if (url.includes('/api/analytics/elements')) {
      return json({ elements: PREVIEW_ANALYTICS.elements })
    }
    if (url.includes('/api/analytics/heatmap')) return json(PREVIEW_ANALYTICS.heatmap)

    return originalFetch ? originalFetch(input, init) : json({})
  }

  return () => {
    globalThis.fetch = originalFetch
  }
}
