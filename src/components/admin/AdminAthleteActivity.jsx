import { useEffect, useMemo, useState } from 'react'
import AuditTimeline from '../ui/AuditTimeline.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { auditLabels } from '../../i18n/adminHelpers.js'
import { fetchAuditEntries, relatedEntityIds } from '../../services/auditService.js'

/**
 * AdminAthleteActivity — PLU ARG
 *
 * Actividad real de un atleta. Antes esta pestaña leía `auditLogs` de
 * localStorage: se llenaba con lo que ese navegador hubiera hecho en esa
 * sesión, así que un operador entrando desde otra máquina veía el historial
 * vacío aunque el atleta tuviera meses de movimientos.
 *
 * `domain_audit_logs` guarda `entity_id` por entidad, así que la relación se
 * arma con los ids que el detalle ya tiene cargados (afiliaciones,
 * inscripciones y órdenes del atleta).
 */
export default function AdminAthleteActivity({
  athleteId,
  memberships = [],
  registrations = [],
  payments = [],
}) {
  const { locale, messages, t } = useI18n()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const entityIds = useMemo(
    () => relatedEntityIds({ athleteId, memberships, registrations, payments }),
    [athleteId, memberships, payments, registrations],
  )

  useEffect(() => {
    if (!entityIds.length) {
      setEntries([])
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')
    fetchAuditEntries({ entityIds, limit: 100 })
      .then((result) => {
        if (!cancelled) setEntries(result.entries)
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError?.message ?? t('admin.audit.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [entityIds, t])

  const labels = useMemo(() => auditLabels(messages), [messages])

  const items = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        action: labels.action(entry.action),
        actor: labels.actor(entry.actorType),
        detail: entry.summary
          .map(({ field, value }) => `${labels.field(field)}: ${value}`)
          .join(' · '),
        createdAt: entry.createdAt,
        createdAtLabel: new Date(entry.createdAt).toLocaleString(
          locale === 'en' ? 'en-US' : 'es-AR',
          { dateStyle: 'short', timeStyle: 'short' },
        ),
      })),
    [entries, labels, locale],
  )

  if (loading) return <p className="data-table__empty">{t('admin.audit.loading')}</p>
  if (error) {
    return (
      <p className="data-table__empty" role="alert">
        {error}
      </p>
    )
  }
  if (!items.length) return <p className="data-table__empty">{t('admin.athleteDetail.emptyActivity')}</p>

  return <AuditTimeline items={items} />
}
