import { useMemo, useRef } from 'react'
import { ArrowRight, BadgeCheck, CalendarDays, ChevronRight, ClipboardList, MapPin, Shield, Users } from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
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
    <article className="admin-spotlight admin-spotlight--luxury">
      <div className="admin-spotlight__main">
        <div className="admin-spotlight__head">
          <span className="admin-spotlight__eyebrow">{t('admin.dashboard.spotlightEyebrow')}</span>
          <span className={`admin-spotlight__status admin-spotlight__status--${tone}`}>{statusLabel}</span>
        </div>
        <h3 className="admin-spotlight__title">{event.title}</h3>
        <ul className="admin-spotlight__meta">
          <li>
            <CalendarDays size={13} aria-hidden />
            {event.date}
          </li>
          <li>
            <MapPin size={13} aria-hidden />
            {event.venue}, {event.location}
          </li>
        </ul>
      </div>

      <div className="admin-spotlight__aside">
        <div className="admin-spotlight__capacity">
          <div className="admin-spotlight__capacity-head">
            <span>{t('admin.dashboard.slots')}</span>
            <strong>
              {event.registered}/{event.slots}
            </strong>
            <em>{fillPercent}%</em>
          </div>
          <div className="admin-spotlight__capacity-bar">
            <span style={{ width: `${fillPercent}%` }} />
          </div>
        </div>
        <button type="button" className="admin-spotlight__cta" onClick={() => onNavigate?.('events')}>
          {t('admin.actions.manage')}
          <ArrowRight size={13} aria-hidden />
        </button>
      </div>
    </article>
  )
}

function DashboardFinancePanel({ canEdit, finance, onApprovePayment, onNavigate, t }) {
  const { collectionRate, collectedAmount, pendingAmount, pendingCount, pendingItems, totalAmount } = finance
  const topPending = pendingItems[0]

  return (
    <div className="admin-finance admin-finance--luxury">
      <div className="admin-finance__hero" aria-label={t('admin.dashboard.financeAria')}>
        <div className="admin-finance__hero-main">
          <span>{t('admin.dashboard.financeOperated')}</span>
          <strong>{money(totalAmount)}</strong>
        </div>
        <div className="admin-finance__hero-rate">
          <strong>{collectionRate}%</strong>
          <span>{t('admin.dashboard.financeRate')}</span>
        </div>
      </div>

      <div className="admin-finance__breakdown">
        <article className="admin-finance__breakdown-item admin-finance__breakdown-item--success">
          <span>{t('admin.dashboard.financeCollected')}</span>
          <strong>{money(collectedAmount)}</strong>
        </article>
        <article className="admin-finance__breakdown-item admin-finance__breakdown-item--pending">
          <span>
            {t('admin.dashboard.financePending')}
            {pendingCount > 0 && <em>{pendingCount}</em>}
          </span>
          <strong>{money(pendingAmount)}</strong>
        </article>
      </div>

      <div className="admin-finance__progress" aria-hidden>
        <span style={{ width: `${collectionRate}%` }} />
      </div>

      {topPending && (
        <div className="admin-finance__pending">
          <div className="admin-finance__pending-copy">
            <span>{t('admin.dashboard.financePending')}</span>
            <strong>{topPending.athlete}</strong>
            <p>
              {money(topPending.amount)} · {topPending.concept}
            </p>
          </div>
          {canEdit && (
            <button type="button" className="admin-dashboard-link" onClick={() => onApprovePayment?.(topPending.id)}>
              {t('admin.actions.validate')}
              <ChevronRight size={14} aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="admin-finance__footer">
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
          {t('admin.actions.registrations')}
        </button>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
          {t('admin.actions.payments')}
        </button>
      </div>
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
  canEdit,
  globalSearch,
  onGlobalSearchChange,
}) {
  const { t } = useI18n()
  const actionQueueRef = useRef(null)

  function scrollToActions() {
    actionQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const statusMessage =
    pendingActions.length > 0
      ? pendingActions.length === 1
        ? t('admin.dashboard.tasksPending', { count: pendingActions.length })
        : t('admin.dashboard.tasksPendingMany', { count: pendingActions.length })
      : t('admin.dashboard.noUrgency')

  const { finance, primary, secondary, spotlightEvent } = dashboardOverview

  const primaryMetrics = useMemo(() => mapMetrics(primary, t), [primary, t])
  const secondaryMetrics = useMemo(() => mapMetrics(secondary, t), [secondary, t])

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--luxury">
      <AdminTopBar
        title={t('admin.dashboard.title')}
        subtitle={pendingActions.length > 0 ? statusMessage : undefined}
        searchValue={globalSearch}
        onSearchChange={onGlobalSearchChange}
        alertCount={pendingPayments}
        onAlertClick={scrollToActions}
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
          <header className="admin-command-center__head">
            <span className="admin-command-center__eyebrow">{t('admin.dashboard.spotlightTitle')}</span>
            <p>{t('admin.dashboard.spotlightSubtitle')}</p>
          </header>
          <DashboardSpotlightEvent event={spotlightEvent} onNavigate={onNavigate} t={t} />
        </article>

        <article className="admin-command-center__pane admin-command-center__pane--finance">
          <header className="admin-command-center__head">
            <span className="admin-command-center__eyebrow">{t('admin.dashboard.financeTitle')}</span>
            <p>{t('admin.dashboard.financeSubtitle')}</p>
          </header>
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
        <div ref={actionQueueRef} className="admin-dashboard__panel admin-dashboard__panel--queue">
          <ActionQueue
            compact
            items={pendingActions}
            onNavigate={onNavigate}
            onApprovePayment={onApprovePayment}
            canEdit={canEdit}
          />
        </div>
        <RecentActivity compact items={recentActivity} />
      </div>
    </div>
  )
}
