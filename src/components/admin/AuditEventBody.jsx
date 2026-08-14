import { useI18n } from '../../i18n/I18nProvider.jsx'
import { presentAuditEvent } from '../../lib/auditPresentation.js'
import { AdminMonoCell } from './AdminTableCells.jsx'

function formatTimestamp(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FactValue({ field, value, locale }) {
  if (field === 'nextRetryAt') {
    return formatTimestamp(value, locale)
  }
  if (field === 'attempt') {
    return String(value)
  }
  if (typeof value === 'string' && value.length > 48) {
    return <span className="audit-event__long">{value}</span>
  }
  return String(value)
}

export default function AuditEventBody({ row, labels }) {
  const { locale, t } = useI18n()
  const { lead, leadKind, facts, hasStory } = presentAuditEvent(row)
  const technical = [
    row.entityId
      ? { key: 'entity', label: labels.entity(row.entityType), value: row.entityId }
      : null,
    row.actorId
      ? { key: 'actor', label: labels.actor(row.actorType), value: row.actorId }
      : null,
  ].filter(Boolean)

  if (!hasStory && technical.length === 0) {
    return <span className="data-table__mono data-table__mono--empty">—</span>
  }

  return (
    <div className="audit-event">
      {lead ? (
        <p
          className={
            leadKind === 'error' || leadKind === 'reason'
              ? 'audit-event__lead audit-event__lead--alert'
              : 'audit-event__lead'
          }
        >
          {lead}
        </p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="audit-event__facts">
          {facts.map(({ field, value }) => (
            <div key={field}>
              <dt>{labels.field(field)}</dt>
              <dd>
                <FactValue field={field} value={value} locale={locale} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {technical.length > 0 ? (
        <details className="audit-event__technical">
          <summary>{t('admin.audit.technicalDetails')}</summary>
          <dl>
            {technical.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>
                  <AdminMonoCell>{item.value}</AdminMonoCell>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  )
}
