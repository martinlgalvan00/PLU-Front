import { useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AuditTimeline from '../../components/ui/AuditTimeline.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import MemberProfileCard from '../../components/ui/MemberProfileCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PAYMENT_METHODS } from '../../lib/constants.js'
import { money } from '../../lib/format.js'

function formatDateTime(value, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function paymentMethodLabel(method) {
  if (!method) return '—'
  return PAYMENT_METHODS[method]?.label ?? method
}

function profileValue(value) {
  if (value == null || value === '') return '—'
  return value
}

export default function AthleteDetailSection({ detail, onBack, canEdit, onApprovePayment }) {
  const { locale, t } = useI18n()
  const [activeTab, setActiveTab] = useState('profile')
  const {
    athlete,
    memberships = [],
    registrations = [],
    payments = [],
    auditLogs = [],
  } = detail ?? {}
  const activeMembership = memberships.find((item) => item.status === 'activa')

  const tabs = useMemo(
    () => [
      { id: 'profile', label: t('admin.athleteDetail.tabs.profile') },
      { id: 'memberships', label: t('admin.athleteDetail.tabs.memberships'), count: memberships.length },
      { id: 'registrations', label: t('admin.athleteDetail.tabs.registrations'), count: registrations.length },
      { id: 'payments', label: t('admin.athleteDetail.tabs.payments'), count: payments.length },
      { id: 'activity', label: t('admin.athleteDetail.tabs.activity'), count: auditLogs.length },
    ],
    [auditLogs.length, memberships.length, payments.length, registrations.length, t],
  )

  const profileGroups = useMemo(
    () => [
      {
        id: 'contact',
        title: t('admin.athleteDetail.groups.contact'),
        fields: [
          { key: 'document', label: t('admin.athleteDetail.fields.document'), value: athlete?.documentId },
          { key: 'email', label: t('admin.athleteDetail.fields.email'), value: athlete?.email },
          { key: 'phone', label: t('admin.athleteDetail.fields.phone'), value: athlete?.phone },
          {
            key: 'location',
            label: t('admin.athleteDetail.fields.location'),
            value: [athlete?.city, athlete?.province].filter(Boolean).join(', '),
          },
          { key: 'gym', label: t('admin.athleteDetail.fields.gym'), value: athlete?.gym },
        ],
      },
      {
        id: 'competition',
        title: t('admin.athleteDetail.groups.competition'),
        fields: [
          { key: 'division', label: t('admin.athleteDetail.fields.division'), value: athlete?.division },
          { key: 'category', label: t('admin.athleteDetail.fields.category'), value: athlete?.category },
          {
            key: 'estimatedWeight',
            label: t('admin.athleteDetail.fields.estimatedWeight'),
            value: athlete?.estimatedWeight ? `${athlete.estimatedWeight} kg` : '',
          },
        ],
      },
    ],
    [athlete, t],
  )

  if (!detail) {
    return null
  }

  return (
    <div className="athlete-detail">
      <button type="button" className="athlete-detail__back" onClick={onBack}>
        <span className="athlete-detail__back-icon" aria-hidden="true">
          <ArrowLeft size={15} strokeWidth={2.25} />
        </span>
        <span>{t('admin.athleteDetail.back')}</span>
      </button>

      <MemberProfileCard
        className="athlete-detail__profile"
        flat
        metaLayout="inline"
        name={athlete.fullName}
        documentId={athlete.documentId}
        gym={athlete.gym}
        status={athlete.status}
        memberCode={activeMembership?.memberCode}
      />

      <DetailTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="editorial"
      />

      {activeTab === 'profile' && (
        <div className="athlete-detail__sheet">
          {profileGroups.map((group) => (
            <section
              key={group.id}
              className={`athlete-detail__group athlete-detail__group--${group.id}`}
              aria-labelledby={`athlete-group-${group.id}`}
            >
              <h3 id={`athlete-group-${group.id}`} className="athlete-detail__group-title">
                {group.title}
              </h3>
              <dl className="athlete-detail__rows">
                {group.fields.map((field) => (
                  <div key={field.key} className="athlete-detail__row">
                    <dt>{field.label}</dt>
                    <dd title={typeof field.value === 'string' ? field.value : undefined}>
                      {profileValue(field.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'memberships' && (
        <div className="athlete-detail__panel">
          <AdminDataTable
            columns={[
              { key: 'year', label: t('admin.columns.year'), mobile: 'primary', desktop: 'numeric', align: 'end' },
              {
                key: 'status',
                label: t('admin.columns.status'),
                mobile: 'badge',
                render: (row) => <StatusBadge value={row.status} />,
              },
              { key: 'memberCode', label: t('admin.columns.code') },
              { key: 'startDate', label: t('admin.columns.start') },
              { key: 'expirationDate', label: t('admin.columns.expiration') },
            ]}
            rows={memberships}
            emptyMessage={t('admin.athleteDetail.emptyMemberships')}
          />
        </div>
      )}

      {activeTab === 'registrations' && (
        <div className="athlete-detail__panel">
          <AdminDataTable
            columns={[
              { key: 'event', label: t('admin.columns.event'), mobile: 'primary' },
              { key: 'category', label: t('admin.columns.category') },
              { key: 'division', label: t('admin.columns.division') },
              {
                key: 'status',
                label: t('admin.columns.status'),
                mobile: 'badge',
                render: (row) => <StatusBadge value={row.status} />,
              },
            ]}
            rows={registrations}
            emptyMessage={t('admin.athleteDetail.emptyRegistrations')}
          />
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="athlete-detail__panel">
          <AdminDataTable
            columns={[
              {
                key: 'concept',
                label: t('admin.columns.concept'),
                mobile: 'primary',
              },
              {
                key: 'status',
                label: t('admin.columns.status'),
                mobile: 'badge',
                render: (row) => <StatusBadge value={row.status} />,
              },
              {
                key: 'createdAt',
                label: t('admin.columns.date'),
                render: (row) => formatDateTime(row.createdAt, locale),
                sortAccessor: (row) => row.createdAt ?? '',
                sortable: true,
              },
              {
                key: 'amount',
                label: t('admin.columns.amount'),
                desktop: 'numeric',
                align: 'end',
                render: (row) => money(row.amount),
              },
              {
                key: 'method',
                label: t('admin.columns.method'),
                render: (row) => paymentMethodLabel(row.method),
              },
              {
                key: 'reference',
                label: t('admin.columns.reference'),
                mobile: 'hidden',
                render: (row) => row.reference || '—',
              },
              {
                key: 'action',
                label: t('admin.columns.action'),
                mobile: 'action',
                render: (row) => (
                  <AdminTableActions>
                    <AdminIconButton
                      disabled={!canEdit || row.status === 'aprobado'}
                      icon={BadgeCheck}
                      label={t('admin.actions.validate')}
                      onClick={() => onApprovePayment?.(row.id)}
                      variant="celeste"
                    />
                  </AdminTableActions>
                ),
              },
            ]}
            rows={payments}
            emptyMessage={t('admin.athleteDetail.emptyPayments')}
          />
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="surface-card surface-card--flat athlete-detail__timeline">
          {auditLogs.length > 0 ? (
            <AuditTimeline items={auditLogs} />
          ) : (
            <p className="data-table__empty">{t('admin.athleteDetail.emptyActivity')}</p>
          )}
        </div>
      )}
    </div>
  )
}
