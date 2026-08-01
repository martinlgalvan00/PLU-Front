import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  MapPin,
  Shield,
  Users,
} from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import CollectionDonut from '../../components/admin/CollectionDonut.jsx'
import RecentActivity from '../../components/admin/RecentActivity.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { METRIC_LABEL_KEYS } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
import { formatDayMonth, money } from '../../lib/format.js'

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

const QUICK_ACTIONS = [
  {
    section: 'registrations',
    icon: ClipboardList,
    labelKey: 'admin.nav.registrations',
    hintKey: 'admin.dashboard.quickRegistrations',
  },
  {
    section: 'athletes',
    icon: Users,
    labelKey: 'admin.nav.athletes',
    hintKey: 'admin.dashboard.quickAthletes',
  },
  {
    section: 'events',
    icon: CalendarDays,
    labelKey: 'admin.nav.events',
    hintKey: 'admin.dashboard.quickEvents',
  },
]

function DashboardKpiTile({ icon, label, value, tone, onClick, index }) {
  const Icon = METRIC_ICONS[icon] ?? Users

  return (
    <button
      type="button"
      className={`admin-bento__cell admin-bento__cell--kpi admin-kpi-tile admin-kpi-tile--strip admin-kpi-tile--${tone}`}
      style={{ '--kpi-index': index }}
      onClick={onClick}
    >
      <span className="admin-kpi-tile__icon" aria-hidden>
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="admin-kpi-tile__body">
        <span className="admin-kpi-tile__value">{value}</span>
        <span className="admin-kpi-tile__label">{label}</span>
      </span>
    </button>
  )
}

function DashboardKpiChip({ label, value, tone, onClick }) {
  return (
    <button type="button" className={`admin-kpi-chip admin-kpi-chip--${tone}`} onClick={onClick}>
      <span className="admin-kpi-chip__value">{value}</span>
      <span className="admin-kpi-chip__label">{label}</span>
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

function DashboardQuickActions({ onNavigate, t }) {
  return (
    <section
      className="admin-bento__cell admin-bento__cell--quick admin-quick-dock"
      aria-labelledby="admin-quick-dock-title"
    >
      <header className="admin-quick-dock__intro">
        <span className="admin-quick-dock__eyebrow">{t('admin.dashboard.quickEyebrow')}</span>
        <h2 id="admin-quick-dock-title">{t('admin.dashboard.quickTitle')}</h2>
      </header>
      <div className="admin-quick-dock__track">
        {QUICK_ACTIONS.map(({ section, icon: Icon, labelKey, hintKey }) => (
          <button
            key={section}
            type="button"
            className="admin-quick-dock__action"
            onClick={() => onNavigate?.(section)}
          >
            <span className="admin-quick-dock__icon" aria-hidden>
              <Icon size={17} strokeWidth={1.7} />
            </span>
            <span className="admin-quick-dock__copy">
              <strong>{t(labelKey)}</strong>
              <small>{t(hintKey)}</small>
            </span>
            <ArrowRight size={14} className="admin-quick-dock__arrow" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}

function DashboardSpotlightEvent({ event, locale, onNavigate, t }) {
  if (!event) {
    return (
      <div className="admin-spotlight admin-spotlight--empty admin-spotlight--flat">
        <p>{t('admin.dashboard.spotlightEmpty')}</p>
        <button
          type="button"
          className="admin-dashboard-link"
          onClick={() => onNavigate?.('events')}
        >
          {t('admin.actions.configureEvents')}
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    )
  }

  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const fillPercent = event.slots > 0 ? Math.round((event.registered / event.slots) * 100) : 0
  const slotsLeft = Math.max((event.slots ?? 0) - (event.registered ?? 0), 0)
  const closesAt = event.registrationClosesAt
    ? formatDayMonth(event.registrationClosesAt.slice(0, 10), locale)
    : null
  const registrationFee = event.pricing?.registration

  return (
    <article className="admin-spotlight admin-spotlight--flat">
      <div className="admin-spotlight__main">
        <div className="admin-spotlight__title-row">
          <h3 className="admin-spotlight__title">{event.title}</h3>
          <span className={`admin-spotlight__status admin-spotlight__status--${tone}`}>
            {statusLabel}
          </span>
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
          <span className="admin-spotlight__fill-count">
            {event.registered}/{event.slots}
          </span>
          <span className="admin-spotlight__fill-percent">{fillPercent}%</span>
        </div>
        <dl className="admin-spotlight__facts">
          <div className="admin-spotlight__fact">
            <dt>{t('admin.dashboard.slotsLeft')}</dt>
            <dd>{slotsLeft}</dd>
          </div>
          {closesAt ? (
            <div className="admin-spotlight__fact">
              <dt>{t('admin.dashboard.registrationCloses')}</dt>
              <dd>{closesAt}</dd>
            </div>
          ) : null}
          {registrationFee > 0 ? (
            <div className="admin-spotlight__fact">
              <dt>{t('admin.dashboard.registrationFee')}</dt>
              <dd>{money(registrationFee, locale)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <button
        type="button"
        className="admin-dashboard-link admin-spotlight__link"
        onClick={() => onNavigate?.('events')}
      >
        {t('admin.actions.manage')}
        <ArrowRight size={13} aria-hidden />
      </button>
    </article>
  )
}

function DashboardFinancePanel({ canEdit, finance, onApprovePayment, onNavigate, t }) {
  const {
    collectionRate,
    collectedAmount,
    pendingAmount,
    pendingCount,
    pendingItems,
    totalAmount,
  } = finance
  const topPending = pendingItems[0]

  return (
    <div className="admin-finance admin-finance--flat">
      <div className="admin-finance__chart">
        <CollectionDonut
          collected={collectedAmount}
          pending={pendingAmount}
          rate={collectionRate}
          label={t('admin.dashboard.financeRate')}
        />
        <dl className="admin-finance__legend" aria-label={t('admin.dashboard.financeAria')}>
          <div className="admin-finance__legend-item admin-finance__legend-item--collected">
            <dt>{t('admin.dashboard.financeCollected')}</dt>
            <dd>{money(collectedAmount)}</dd>
          </div>
          <div className="admin-finance__legend-item admin-finance__legend-item--pending">
            <dt>
              {t('admin.dashboard.financePending')}
              {pendingCount > 0 ? ` · ${pendingCount}` : ''}
            </dt>
            <dd>{money(pendingAmount)}</dd>
          </div>
          <div className="admin-finance__legend-item admin-finance__legend-item--total">
            <dt>{t('admin.dashboard.financeOperated')}</dt>
            <dd>{money(totalAmount)}</dd>
          </div>
        </dl>
      </div>

      {topPending && (
        <div className="admin-finance__pending admin-finance__pending--flat">
          <div className="admin-finance__pending-copy">
            <strong>{topPending.athlete}</strong>
            <p>
              {money(topPending.amount)} · {topPending.concept}
            </p>
          </div>
          <div className="admin-finance__pending-actions">
            {canEdit && (
              <button
                type="button"
                className="admin-finance__pending-action"
                onClick={() => onApprovePayment?.(topPending.id)}
              >
                {t('admin.actions.validate')}
                <ChevronRight size={14} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="admin-dashboard-link"
              onClick={() => onNavigate?.('registrations')}
            >
              {t('admin.actions.payments')}
            </button>
          </div>
        </div>
      )}

      {!topPending && (
        <div className="admin-finance__footer">
          <button
            type="button"
            className="admin-dashboard-link"
            onClick={() => onNavigate?.('registrations')}
          >
            {t('admin.actions.payments')}
            <ArrowRight size={13} aria-hidden />
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
  onGlobalSearchSubmit,
}) {
  const { locale, t } = useI18n()
  const [alertsOpen, setAlertsOpen] = useState(false)

  const { finance, primary, secondary, spotlightEvent } = dashboardOverview

  const financeSubtitle = t('admin.dashboard.financeSubtitleLive', {
    pending: finance.pendingCount,
    events: finance.openEvents,
  })

  const primaryMetrics = useMemo(() => mapMetrics(primary, t), [primary, t])
  const secondaryMetrics = useMemo(() => mapMetrics(secondary, t), [secondary, t])

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--luxury admin-dashboard--executive admin-dashboard--bento">
      <AdminTopBar
        title={t('admin.dashboard.title')}
        subtitle={t('admin.dashboard.subtitle')}
        searchValue={globalSearch}
        onSearchChange={onGlobalSearchChange}
        onSearchSubmit={onGlobalSearchSubmit}
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

      <section className="admin-bento" aria-label={t('admin.dashboard.metricsAria')}>
        {pendingActions.length > 0 && (
          <button
            type="button"
            className="admin-bento__cell admin-bento__cell--alerts admin-attention-bar"
            onClick={() => setAlertsOpen(true)}
          >
            <span className="admin-attention-bar__count">{pendingActions.length}</span>
            <span className="admin-attention-bar__copy">
              {pendingActions.length === 1
                ? t('admin.actionQueue.tasks', { count: pendingActions.length })
                : t('admin.actionQueue.tasksMany', { count: pendingActions.length })}
            </span>
            <span className="admin-attention-bar__action">
              {t('admin.actionQueue.title')}
              <ChevronRight size={14} aria-hidden />
            </span>
          </button>
        )}

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

        <section className="admin-bento__cell admin-bento__cell--finance">
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
        </section>

        <section className="admin-bento__cell admin-bento__cell--spotlight">
          <CommandCenterPaneHead eyebrow={t('admin.dashboard.spotlightTitle')} />
          <DashboardSpotlightEvent
            event={spotlightEvent}
            locale={locale}
            onNavigate={onNavigate}
            t={t}
          />
        </section>

        <div className="admin-bento__cell admin-bento__cell--activity">
          <RecentActivity compact items={recentActivity} />
        </div>

        {secondaryMetrics.length > 0 && (
          <section className="admin-bento__cell admin-bento__cell--pulse">
            <CommandCenterPaneHead eyebrow={t('admin.dashboard.secondaryTitle')} />
            <div className="admin-kpi-sub">
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
          </section>
        )}

        <DashboardQuickActions onNavigate={onNavigate} t={t} />
      </section>
    </div>
  )
}
