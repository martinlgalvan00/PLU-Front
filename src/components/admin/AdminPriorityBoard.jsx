import { ArrowRight, CircleCheck, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDayMonth } from '../../lib/format.js'

const SEVERITY_ICONS = {
  urgent: TriangleAlert,
  warning: CircleAlert,
  info: Info,
}

function reminderLabel(item, t) {
  const one = item.count === 1
  switch (item.kind) {
    case 'manual_payments':
      return t(
        one
          ? 'admin.dashboard.reminder.manualPaymentsOne'
          : 'admin.dashboard.reminder.manualPayments',
      )
    case 'observed_registrations':
      return t(
        one
          ? 'admin.dashboard.reminder.observedRegistrationsOne'
          : 'admin.dashboard.reminder.observedRegistrations',
      )
    case 'event_consistency':
      return t(
        one
          ? 'admin.dashboard.reminder.eventConsistencyOne'
          : 'admin.dashboard.reminder.eventConsistency',
      )
    case 'ticket_orders':
      return t(one ? 'admin.dashboard.reminder.ticketOrdersOne' : 'admin.dashboard.reminder.ticketOrders')
    case 'gate_registrations':
      return t(
        one
          ? 'admin.dashboard.reminder.gateRegistrationsOne'
          : 'admin.dashboard.reminder.gateRegistrations',
      )
    case 'expiring_memberships':
      return t(
        one
          ? 'admin.dashboard.reminder.expiringMembershipsOne'
          : 'admin.dashboard.reminder.expiringMemberships',
      )
    case 'closing_event':
      return `${item.event.title} · ${t('admin.dashboard.reminder.closingEvent')}`
    case 'nearly_full_event':
      return item.event.title
    default:
      return item.id
  }
}

function reminderMeta(item, locale, t) {
  if (item.kind === 'event_consistency' && item.eventTitles?.length) {
    return item.eventTitles.join(' · ')
  }
  if (item.kind === 'expiring_memberships' && item.earliestDate) {
    return t('admin.dashboard.reminder.expiresOn', {
      date: formatDayMonth(item.earliestDate.slice(0, 10), locale),
    })
  }
  if (item.kind === 'closing_event') {
    return item.event.daysLeft === 0
      ? t('admin.dashboard.reminder.closingToday')
      : t('admin.dashboard.reminder.closingInDays', { count: item.event.daysLeft })
  }
  if (item.kind === 'nearly_full_event') {
    return t('admin.dashboard.reminder.nearlyFull', { percent: item.count })
  }
  return null
}

function reminderStat(item) {
  if (item.kind === 'closing_event') return String(item.event.daysLeft)
  if (item.kind === 'nearly_full_event') return `${item.count}%`
  return String(item.count)
}

/**
 * Mesa de prioridades del dashboard: lo primero que el operador debe leer
 * al entrar al panel. Cada fila es un tema abierto con severidad, dato
 * duro y acción de salida — el detalle caso por caso vive en la cola de
 * trabajo y en las secciones. Reemplaza a la vieja tira de "flujos":
 * misma información, pero priorizada y accionable.
 */
export default function AdminPriorityBoard({ reminders, onNavigate }) {
  const { locale, t } = useI18n()
  const items = reminders?.items ?? []
  const openCount = reminders?.openCount ?? 0

  const subtitle =
    openCount === 1
      ? t('admin.dashboard.focusSubtitleOne')
      : t('admin.dashboard.focusSubtitleMany', { count: openCount })

  return (
    <section className="admin-ops__focus" aria-labelledby="admin-focus-title" data-tour="dashboard-focus">
      <header className="admin-ops__focus-head">
        <div>
          <span className="admin-ops__eyebrow">{t('admin.dashboard.focusEyebrow')}</span>
          <h3 id="admin-focus-title">{t('admin.dashboard.focusTitle')}</h3>
          <p>{subtitle}</p>
        </div>
      </header>

      {items.length > 0 ? (
        <ul className="admin-ops__focus-list">
          {items.map((item) => {
            const SeverityIcon = SEVERITY_ICONS[item.severity] ?? Info
            const meta = reminderMeta(item, locale, t)
            const stat = reminderStat(item)
            const label = reminderLabel(item, t)
            return (
              <li
                key={item.id}
                className={`admin-ops__focus-item admin-ops__focus-item--${item.severity}`}
              >
                <span className="admin-ops__focus-icon" aria-hidden>
                  <SeverityIcon size={15} strokeWidth={1.9} />
                </span>
                <strong className="admin-ops__focus-stat">{stat}</strong>
                <div className="admin-ops__focus-copy">
                  <span className="admin-ops__focus-label">{label}</span>
                  {meta ? <span className="admin-ops__focus-meta">{meta}</span> : null}
                </div>
                <button
                  type="button"
                  className="admin-ops__focus-open"
                  onClick={() => onNavigate?.(item.section)}
                >
                  <span>{t('admin.dashboard.focusOpen')}</span>
                  <ArrowRight size={14} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="admin-ops__focus-clear">
          <span className="admin-ops__focus-clear-icon" aria-hidden>
            <CircleCheck size={18} strokeWidth={1.8} />
          </span>
          <p>{t('admin.dashboard.focusEmpty')}</p>
        </div>
      )}
    </section>
  )
}
