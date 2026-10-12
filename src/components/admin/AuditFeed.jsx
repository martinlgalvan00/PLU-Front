import { ChevronRight, CircleAlert, Route, TriangleAlert } from 'lucide-react'
import AdminIconButton from './AdminIconButton.jsx'
import { formatAuditDayLabel, formatAuditTime, summarizeAuditEntry } from '../../lib/auditFeed.js'
import { isAuditIncidentEntry } from '../../services/auditService.js'

/**
 * Bitácora como línea de tiempo. Cada evento es una frase (qué pasó, a quién o
 * a qué orden, quién lo hizo) y lleva a su detalle; los ids técnicos, el actor
 * y la entidad quedan en el diálogo en vez de repetirse en cinco columnas.
 *
 * La marca de un incidente es un ícono con su texto para lector de pantalla,
 * no sólo un color: sirve igual en tema claro, en monocromo y sin color.
 */

function Marker({ tone }) {
  if (tone === 'danger') return <CircleAlert size={15} aria-hidden />
  if (tone === 'warning') return <TriangleAlert size={15} aria-hidden />
  return <span className="audit-feed__dot" />
}

/** Un motivo técnico en snake_case (`invalid_credentials`) se traduce si hay copy. */
function readableLead(lead, t) {
  if (!lead || !/^[a-z]+(_[a-z]+)*$/.test(lead)) return lead
  const key = `admin.analytics.access.reasons.${lead}`
  const label = t(key)
  return label === key ? lead.replace(/_/g, ' ') : label
}

function uniqueLabel(parts) {
  return parts
    .filter(Boolean)
    .filter((part, index, list) => list.indexOf(part) === index)
    .join(' · ')
}

function AuditFeedItem({ entry, labels, onOpenDetail, onOpenTrace, t, traceable }) {
  const incident = isAuditIncidentEntry(entry)
  const tone = entry.tone === 'default' ? 'neutral' : entry.tone
  const { lead: rawLead, facts } = summarizeAuditEntry(entry)
  const lead = readableLead(rawLead, t)
  const origin = uniqueLabel([
    labels.source(entry.source),
    entry.actorType ? labels.actor(entry.actorType) : null,
  ])
  const severity = incident
    ? t(`admin.audit.severities.${tone === 'danger' ? 'danger' : 'warning'}`)
    : null

  return (
    <li className={`audit-feed__item audit-feed__item--${tone}${incident ? ' is-incident' : ''}`}>
      <button type="button" className="audit-feed__main" onClick={() => onOpenDetail(entry.id)}>
        <time className="audit-feed__time" dateTime={entry.createdAt}>
          {formatAuditTime(entry.createdAt)}
        </time>
        <span className="audit-feed__marker">
          <Marker tone={tone} />
        </span>
        <span className="audit-feed__body">
          <span className="audit-feed__title">
            {labels.action(entry.action)}
            {severity ? (
              <span className={`audit-feed__severity audit-feed__severity--${tone}`}>
                {severity}
              </span>
            ) : null}
          </span>
          {lead ? <span className="audit-feed__lead">{lead}</span> : null}
          {facts.length > 0 ? (
            <span className="audit-feed__facts">
              {facts.map((fact) => (
                <span key={fact.field}>
                  <span className="audit-feed__fact-label">{labels.field(fact.field)}</span>{' '}
                  {fact.value}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="audit-feed__origin" title={origin}>
          {origin}
        </span>
        <ChevronRight className="audit-feed__chevron" size={16} aria-hidden />
        <span className="sr-only">{t('admin.audit.openDetail')}</span>
      </button>
      {traceable ? (
        <AdminIconButton
          icon={Route}
          label={t('admin.paymentTrace.open')}
          onClick={() => onOpenTrace(entry.entityId)}
          variant="ghost"
        />
      ) : null}
    </li>
  )
}

export default function AuditFeed({
  dayLabels,
  groups,
  isTraceable,
  labels,
  now,
  onOpenDetail,
  onOpenTrace,
  t,
}) {
  return (
    <div className="audit-feed" aria-label={t('admin.audit.mobileListLabel')}>
      {groups.map((group) => {
        const label = formatAuditDayLabel(group, { ...dayLabels, now })
        const count = group.entries.length
        const criticalCount = group.entries.filter((entry) => entry.tone === 'danger').length
        return (
          <section key={group.key} className="audit-feed__day" aria-label={label}>
            <h3 className="audit-feed__day-title">
              {label}
              <span>
                {count === 1 ? t('admin.audit.dayCountOne') : t('admin.audit.dayCount', { count })}
              </span>
              {criticalCount > 0 ? (
                <span className="audit-feed__day-critical">
                  {criticalCount === 1
                    ? t('admin.audit.dayCritical', { count: criticalCount })
                    : t('admin.audit.dayCriticalMany', { count: criticalCount })}
                </span>
              ) : null}
            </h3>
            <ol className="audit-feed__list">
              {group.entries.map((entry) => (
                <AuditFeedItem
                  key={entry.id}
                  entry={entry}
                  labels={labels}
                  onOpenDetail={onOpenDetail}
                  onOpenTrace={onOpenTrace}
                  t={t}
                  traceable={isTraceable(entry)}
                />
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
