import { presentAuditEvent } from '../../lib/auditPresentation.js'
import { AdminMonoCell } from './AdminTableCells.jsx'
import es from '../../i18n/locales/es.js'
import { translate } from '../../i18n/translate.js'

function formatTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FactValue({ field, value }) {
  if (field === 'nextRetryAt') {
    return formatTimestamp(value)
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
  const { lead, leadKind, facts, hasStory } = presentAuditEvent(row)
  const technical = [
    row.entityId
      ? { key: 'entity', label: labels.entity(row.entityType), value: row.entityId }
      : null,
    row.actorId ? { key: 'actor', label: labels.actor(row.actorType), value: row.actorId } : null,
  ].filter(Boolean)

  if (!hasStory && technical.length === 0) {
    return <span className="data-table__mono data-table__mono--empty">—</span>
  }

  return (
    <div className="audit-event">
      {lead ? (
        <p
          className={[
            'audit-event__lead',
            leadKind === 'error' || leadKind === 'reason' ? 'audit-event__lead--alert' : '',
            row.tone === 'warning' ? 'audit-event__lead--warning' : '',
          ]
            .filter(Boolean)
            .join(' ')}
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
                <FactValue field={field} value={value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {technical.length > 0 ? (
        <details className="audit-event__technical">
          <summary>{translate(es, 'admin.audit.technicalDetails')}</summary>
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
