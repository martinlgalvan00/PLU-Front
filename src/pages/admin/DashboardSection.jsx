import { useMemo, useState } from 'react'
import { ArrowRight, BadgeCheck, CalendarDays, ChevronRight, ClipboardList, MapPin, Shield, Users } from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import ActionQueue from '../../components/admin/ActionQueue.jsx'
import RecentActivity from '../../components/admin/RecentActivity.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { METRIC_LABEL_KEYS } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
import { money } from '../../lib/format.js'

const METRIC_TONES = {
  users: 'celeste',
  badge: 'gold',
  clipboard: 'default',
  shield: 'alert',
  success: 'celeste',
  warning: 'alert',
  celeste: 'celeste',
  gold: 'gold',
}

const METRIC_ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

function DashboardKpiTile({ icon, label, value, tone, onClick, index }) {
  const Icon = METRIC_ICONS[icon] ?? Users

  return (
    <button
      type="button"
      className={`admin-kpi-tile admin-kpi-tile--${tone}`}
      style={{ '--kpi-index': index }}
      onClick={onClick}
    >
      <span className="admin-kpi-tile__icon" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="admin-kpi-tile__body">
        <strong className="admin-kpi-tile__value">{value}</strong>
        <span className="admin-kpi-tile__label">{label}</span>
      </span>
    </button>
  )
}

function DashboardKpiChip({ label, value, tone, onClick }) {
  return (
    <button type="button" className={`admin-kpi-chip admin-kpi-chip--${tone}`} onClick={onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  )
}

function mapMetrics(items, t) {
  return items.map((item) => ({
    ...item,
    label: t(METRIC_LABEL_KEYS[item.labelKey] ?? item.labelKey),
    tone: METRIC_TONES[item.tone ?? item.icon] ?? item.tone ?? 'default',
  }))
}

function CommandCenterPaneHead({ eyebrow, subtitle, hideSubtitle = false }) {
  return (
    <header className="admin-command-center__head">
      <span className="admin-command-center__eyebrow">{eyebrow}</span>
      {!hideSubtitle && subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}

function DashboardSpotlightEvent({ event, onNavigate, t }) {
  if (!event) {
    return (
      <div className="admin-spotlight admin-spotlight--empty admin-spotlight--luxury">
        <p>{t('admin.dashboard.spotlightEmpty')}</p>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('events')}>
          {t('admin.actions.configureEvents')}
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    )
  }

  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const fillPercent = event.slots > 0 ? Math.round((event.registered / event.slots) * 100) : 0

  return (
    <article className="admin-spotlight admin-spotlight--luxury admin-spotlight--compact">
      <div className="admin-spotlight__main">
        <div className="admin-spotlight__title-row">
          <h3 className="admin-spotlight__title">{event.title}</h3>
          <span className={`admin-spotlight__status admin-spotlight__status--${tone}`}>{statusLabel}</span>
        </div>
        <ul className="admin-spotlight__meta admin-spotlight__meta--inline">
          <li>
            <CalendarDays size={13} aria-hidden />
            {event.date}
          </li>
          <li>
            <MapPin size={13} aria-hidden />
            {event.venue}
          </li>
        </ul>
        <div className="admin-spotlight__fill" aria-label={t('admin.dashboard.slots')}>
          <span className="admin-spotlight__fill-label">{t('admin.dashboard.slots')}</span>
          <div className="admin-spotlight__capacity-bar">
            <span style={{ width: `${fillPercent}%` }} />
          </div>
          <strong>
            {event.registered}/{event.slots}
          </strong>
          <em>{fillPercent}%</em>
        </div>
      </div>
      <button type="button" className="admin-spotlight__cta" onClick={() => onNavigate?.('events')}>
        {t('admin.actions.manage')}
        <ArrowRight size={13} aria-hidden />
      </button>
    </article>
  )
}

function DashboardFinancePanel({ canEdit, finance, onApprovePayment, onNavigate, t }) {
  const { collectionRate, collectedAmount, pendingAmount, pendingCount, pendingItems, totalAmount } = finance
  const topPending = pendingItems[0]

  return (
    <div className="admin-finance admin-finance--luxury admin-finance--compact">
      <div className="admin-finance__strip" aria-label={t('admin.dashboard.financeAria')}>
        <div className="admin-finance__strip-primary">
          <span>{t('admin.dashboard.financeOperated')}</span>
          <strong>{money(totalAmount)}</strong>
        </div>
        <div className="admin-finance__strip-stats">
          <span className="admin-finance__strip-stat admin-finance__strip-stat--rate">
            <em>{t('admin.dashboard.financeRate')}</em>
            <strong>{collectionRate}%</strong>
          </span>
          <span className="admin-finance__strip-stat admin-finance__strip-stat--success">
            <em>{t('admin.dashboard.financeCollected')}</em>
            <strong>{money(collectedAmount)}</strong>
          </span>
          <span className="admin-finance__strip-stat admin-finance__strip-stat--pending">
            <em>
              {t('admin.dashboard.financePending')}
              {pendingCount > 0 && <i>{pendingCount}</i>}
            </em>
            <strong>{money(pendingAmount)}</strong>
          </span>
        </div>
        <div className="admin-finance__progress" aria-hidden>
          <span style={{ width: `${collectionRate}%` }} />
        </div>
      </div>

      {topPending && (
        <div className="admin-finance__pending">
          <div className="admin-finance__pending-copy">
            <strong>{topPending.athlete}</strong>
            <p>
              {money(topPending.amount)} · {topPending.concept}
            </p>
          </div>
          <div className="admin-finance__pending-actions">
            {canEdit && (
              <button type="button" className="admin-finance__pending-action" onClick={() => onApprovePayment?.(topPending.id)}>
                {t('admin.actions.validate')}
                <ChevronRight size={14} aria-hidden />
              </button>
            )}
            <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
              {t('admin.actions.payments')}
            </button>
          </div>
        </div>
      )}

      {!topPending && (
        <div className="admin-finance__footer">
          <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
            {t('admin.actions.registrations')}
          </button>
          <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
            {t('admin.actions.payments')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardSection({
  dashboardOverview,
  pendingActions,
  pendingPayments,
  recentActivity = [],
  onNavigate,
  onApprovePayment,
  onApproveTicketOrder,
  canEdit,
  globalSearch,
  onGlobalSearchChange,
}) {
  const { t } = useI18n()
  const [alertsOpen, setAlertsOpen] = useState(false)

  const { finance, primary, secondary, spotlightEvent } = dashboardOverview

  const financeSubtitle = t('admin.dashboard.financeSubtitleLive', {
    pending: finance.pendingCount,
    events: finance.openEvents,
  })

  const primaryMetrics = useMemo(() => mapMetrics(primary, t), [primary, t])
  const secondaryMetrics = useMemo(() => mapMetrics(secondary, t), [secondary, t])

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--luxury">
      <AdminTopBar
        title={t('admin.dashboard.title')}
        searchValue={globalSearch}
        onSearchChange={onGlobalSearchChange}
        alertCount={pendingActions.length > 0 ? pendingActions.length : pendingPayments}
        alertsOpen={alertsOpen}
        onAlertClick={() => setAlertsOpen(true)}
      />

      <AdminActionDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        items={pendingActions}
        onNavigate={onNavigate}
        onApprovePayment={onApprovePayment}
        onApproveTicketOrder={onApproveTicketOrder}
        canEdit={canEdit}
      />

      <section className="admin-dashboard-snapshot admin-dashboard__block" aria-label={t('admin.dashboard.metricsAria')}>
        <div className="admin-kpi-grid" role="list">
          {primaryMetrics.map((item, index) => (
            <DashboardKpiTile
              key={item.labelKey}
              icon={item.icon}
              index={index}
              label={item.label}
              tone={item.tone}
              value={item.value}
              onClick={() => onNavigate?.(item.section)}
            />
          ))}
        </div>

        {secondaryMetrics.length > 0 && (
          <div className="admin-kpi-chips" role="list">
            {secondaryMetrics.map((item) => (
              <DashboardKpiChip
                key={item.labelKey}
                label={item.label}
                tone={item.tone}
                value={item.value}
                onClick={() => onNavigate?.(item.section)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="admin-command-center admin-dashboard__block">
        <article className="admin-command-center__pane admin-command-center__pane--spotlight">
          <CommandCenterPaneHead eyebrow={t('admin.dashboard.spotlightTitle')} />
          <DashboardSpotlightEvent event={spotlightEvent} onNavigate={onNavigate} t={t} />
        </article>

        <article className="admin-command-center__pane admin-command-center__pane--finance">
          <CommandCenterPaneHead
            eyebrow={t('admin.dashboard.financeTitle')}
            subtitle={financeSubtitle}
          />
          <DashboardFinancePanel
            canEdit={canEdit}
            finance={finance}
            onApprovePayment={onApprovePayment}
            onNavigate={onNavigate}
            t={t}
          />
        </article>
      </section>

      <div className="admin-dashboard__panels admin-dashboard__block">
        <div className="admin-dashboard__panel admin-dashboard__panel--queue">
          <ActionQueue
            compact
            items={pendingActions}
            onNavigate={onNavigate}
            onApprovePayment={onApprovePayment}
            onApproveTicketOrder={onApproveTicketOrder}
            canEdit={canEdit}
          />
        </div>
        <RecentActivity compact items={recentActivity} />
      </div>
    </div>
  )
}
