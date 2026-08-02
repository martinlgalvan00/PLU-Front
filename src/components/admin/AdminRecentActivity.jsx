import { useEffect, useMemo, useState } from 'react'
import RecentActivity from './RecentActivity.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchAuditEntries } from '../../services/auditService.js'

/**
 * AdminRecentActivity — PLU ARG
 *
 * Últimos movimientos del sistema en el resumen. El panel tenía el componente
 * `RecentActivity` sin cablear y un `recentActivity` armado sobre localStorage
 * que nunca llegaba a renderizarse; acá se alimenta de `domain_audit_logs`.
 *
 * Falla en silencio a propósito: es un panel de contexto y el resumen tiene que
 * seguir siendo usable si la auditoría no responde o el operador no tiene
 * `admin.audit.read`.
 */
export default function AdminRecentActivity({ limit = 6 }) {
  const { locale, t } = useI18n()
  const [entries, setEntries] = useState([])
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchAuditEntries({ limit })
      .then((result) => {
        if (!cancelled) setEntries(result.entries)
      })
      .catch(() => {
        if (!cancelled) setVisible(false)
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  const items = useMemo(
    () =>
      entries.map((entry) => {
        const actionKey = `admin.audit.actions.${entry.action}`
        const actorKey = `admin.audit.actors.${entry.actorType}`
        const actionLabel = t(actionKey)
        const actorLabel = t(actorKey)

        return {
          id: entry.id,
          action: actionLabel === actionKey ? entry.action : actionLabel,
          actor: actorLabel === actorKey ? entry.actorType : actorLabel,
          detail: entry.summary
            .slice(0, 2)
            .map(({ value }) => String(value))
            .join(' · '),
          createdAt: entry.createdAt,
          createdAtLabel: new Date(entry.createdAt).toLocaleString(
            locale === 'en' ? 'en-US' : 'es-AR',
            { dateStyle: 'short', timeStyle: 'short' },
          ),
        }
      }),
    [entries, locale, t],
  )

  if (!visible || items.length === 0) return null

  return <RecentActivity compact items={items} />
}
