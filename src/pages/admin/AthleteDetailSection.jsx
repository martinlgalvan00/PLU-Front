import { useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AuditTimeline from '../../components/ui/AuditTimeline.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import MemberProfileCard from '../../components/ui/MemberProfileCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

export default function AthleteDetailSection({ detail, onBack, canEdit, onApprovePayment }) {
  const { t } = useI18n()
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

  if (!detail) {
    return null
  }

  return (
    <div className="athlete-detail">
      <button type="button" className="btn btn--ghost athlete-detail__back" onClick={onBack}>
        <ArrowLeft size={16} />
        {t('admin.athleteDetail.back')}
      </button>

      <MemberProfileCard
        name={athlete.fullName}
        documentId={athlete.documentId}
        email={athlete.email}
        gym={athlete.gym}
        status={athlete.status}
        memberCode={activeMembership?.memberCode}
      />

      <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && (
        <dl className="athlete-detail__grid surface-card">
          <dt>{t('admin.athleteDetail.fields.document')}</dt>
          <dd>{athlete.documentId}</dd>
          <dt>{t('admin.athleteDetail.fields.email')}</dt>
          <dd>{athlete.email}</dd>
          <dt>{t('admin.athleteDetail.fields.phone')}</dt>
          <dd>{athlete.phone}</dd>
          <dt>{t('admin.athleteDetail.fields.location')}</dt>
          <dd>
            {athlete.city}, {athlete.province}
          </dd>
          <dt>{t('admin.athleteDetail.fields.gym')}</dt>
          <dd>{athlete.gym}</dd>
          <dt>{t('admin.athleteDetail.fields.division')}</dt>
          <dd>{athlete.division}</dd>
          <dt>{t('admin.athleteDetail.fields.category')}</dt>
          <dd>{athlete.category}</dd>
          <dt>{t('admin.athleteDetail.fields.estimatedWeight')}</dt>
          <dd>{athlete.estimatedWeight ? `${athlete.estimatedWeight} kg` : '—'}</dd>
        </dl>
      )}

      {activeTab === 'memberships' && (
        <DataTable
          columns={[
            { key: 'year', label: t('admin.columns.year') },
            { key: 'memberCode', label: t('admin.columns.code') },
            {
              key: 'status',
              label: t('admin.columns.status'),
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'startDate', label: t('admin.columns.start') },
            { key: 'expirationDate', label: t('admin.columns.expiration') },
          ]}
          rows={memberships}
          emptyMessage={t('admin.athleteDetail.emptyMemberships')}
        />
      )}

      {activeTab === 'registrations' && (
        <DataTable
          columns={[
            { key: 'event', label: t('admin.columns.event') },
            { key: 'category', label: t('admin.columns.category') },
            { key: 'division', label: t('admin.columns.division') },
            {
              key: 'status',
              label: t('admin.columns.status'),
              render: (row) => <StatusBadge value={row.status} />,
            },
          ]}
          rows={registrations}
          emptyMessage={t('admin.athleteDetail.emptyRegistrations')}
        />
      )}

      {activeTab === 'payments' && (
        <DataTable
          columns={[
            { key: 'concept', label: t('admin.columns.concept') },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              render: (row) => money(row.amount),
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'method', label: t('admin.columns.method') },
            {
              key: 'action',
              label: t('admin.columns.action'),
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
      )}

      {activeTab === 'activity' && (
        <div className="surface-card athlete-detail__timeline">
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
