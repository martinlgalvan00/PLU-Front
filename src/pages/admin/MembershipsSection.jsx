import { useMemo, useState } from 'react'
import { Ban, CircleCheck, LoaderCircle, QrCode, Trash2 } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import MembershipCredentialModal from '../../components/admin/MembershipCredentialModal.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminPeriodCell,
} from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_EXPIRING_FILTER_OPTIONS, MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { formatShortMemberCode } from '../../lib/format.js'
import {
  filterMemberships,
  getMembershipLifecycle,
  getMembershipOperationalStatus,
  getMembershipStats,
  MEMBERSHIP_LIFECYCLE,
} from '../../services/membershipService.js'

export default function MembershipsSection({
  memberships,
  onSelectAthlete,
  onSetMembershipStatus,
  onDelete,
  canManage = false,
  canDelete = false,
}) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expiring, setExpiring] = useState('all')
  // Credencial abierta en modal. Guardamos id + nombre para el encabezado
  // sin esperar al fetch; solo una abierta a la vez.
  const [credentialTarget, setCredentialTarget] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function applyStatus(membershipId, nextStatus) {
    setPendingId(membershipId)
    setActionError('')
    try {
      const result = await onSetMembershipStatus?.(membershipId, nextStatus)
      if (result?.error) {
        setActionError(result.error)
        return false
      }
      if (nextStatus === 'cancelada') setCancelTarget(null)
      return true
    } catch (error) {
      setActionError(error?.message ?? t('admin.sections.memberships.actionError'))
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function deleteMembership() {
    if (!deleteTarget || !onDelete) return
    setPendingId(deleteTarget.id)
    setActionError('')
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setActionError(error?.message ?? 'No se pudo eliminar la afiliación.')
    } finally {
      setPendingId(null)
    }
  }

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const item of memberships) {
      const operationalStatus = getMembershipOperationalStatus(item)
      counts[operationalStatus] = (counts[operationalStatus] ?? 0) + 1
    }
    return counts
  }, [memberships])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(MEMBERSHIP_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? memberships.length : (statusCounts[value] ?? 0),
      ]),
    [memberships.length, statusCounts, t],
  )

  const expiringOptions = useMemo(
    () => translateFilterOptions(MEMBERSHIP_EXPIRING_FILTER_OPTIONS, t),
    [t],
  )

  const rows = useMemo(
    () =>
      filterMemberships(memberships, { query, status, expiring }).map((item) => {
        const lifecycle = getMembershipLifecycle(item)
        return {
          id: item.id,
          athlete: item.athlete?.fullName ?? '—',
          athleteId: item.athleteId,
          document: item.athlete?.documentId ?? '—',
          memberCode: item.memberCode,
          year: item.year,
          status: item.status,
          operationalStatus: getMembershipOperationalStatus(item),
          lifecycle,
          startDate: item.startDate,
          expirationDate: item.expirationDate,
          canViewCredential: [
            MEMBERSHIP_LIFECYCLE.CURRENT,
            MEMBERSHIP_LIFECYCLE.EXPIRING,
          ].includes(lifecycle),
          canActivate:
            item.status !== 'activa' && lifecycle !== MEMBERSHIP_LIFECYCLE.REFUNDED,
          canCancel: [
            MEMBERSHIP_LIFECYCLE.CURRENT,
            MEMBERSHIP_LIFECYCLE.EXPIRING,
            MEMBERSHIP_LIFECYCLE.SCHEDULED,
          ].includes(lifecycle),
        }
      }),
    [memberships, query, status, expiring],
  )

  // Métricas de gestión, no un recuento de estados: lo que el admin necesita
  // saber de un vistazo es cuántos socios cubre hoy la afiliación, cuántos
  // entraron este mes, a quiénes hay que ir a renovar y cuánto quedó trabado
  // esperando pago.
  const metrics = useMemo(() => getMembershipStats(memberships), [memberships])

  const stats = useMemo(
    () => [
      {
        label: t('admin.sections.memberships.statActive'),
        value: metrics.active,
        tone: 'success',
      },
      {
        label: t('admin.sections.memberships.statNewThisMonth'),
        value: metrics.newThisMonth,
        tone: 'default',
      },
      {
        label: t('admin.sections.memberships.statExpiringSoon'),
        value: metrics.expiringSoon,
        tone: 'warning',
      },
      {
        label: t('admin.sections.memberships.statPendingPayment'),
        value: metrics.pendingPayment,
        tone: metrics.pendingPayment > 0 ? 'warning' : 'default',
      },
    ],
    [metrics, t],
  )

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.membership')}
      query={query}
      showHeader
      showStats
      eyebrow={t('admin.sections.memberships.eyebrow')}
      title={t('admin.sections.memberships.title')}
      subtitle={t('admin.sections.memberships.subtitle')}
      stats={stats}
      totalCount={memberships.length}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
        {
          id: 'expiring',
          label: t('admin.filters.expiration'),
          value: expiring,
          onChange: setExpiring,
          options: expiringOptions,
          variant: 'toggle',
        },
      ]}
      onQueryChange={setQuery}
    >
      <AdminDataTable
        className="admin-data-table--memberships"
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            desktop: 'primary',
            sortable: true,
            defaultSort: 'asc',
            render: (row) => (
              <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} subMono />
            ),
          },
          {
            key: 'memberCode',
            label: t('admin.columns.code'),
            mobile: 'default',
            mobileSortLabel: t('admin.columns.code'),
            className: 'data-table__column--mono data-table__column--code',
            sortable: true,
            mobileSortable: false,
            render: (row) => (
              <AdminMonoCell title={row.memberCode}>
                {formatShortMemberCode(row.memberCode)}
              </AdminMonoCell>
            ),
          },
          {
            key: 'expirationDate',
            label: t('admin.columns.period'),
            mobile: 'default',
            mobileSortLabel: t('admin.columns.expiration'),
            className: 'data-table__column--period',
            sortable: true,
            mobileSortable: false,
            sortAccessor: (row) => row.expirationDate,
            render: (row) => (
              <AdminPeriodCell
                start={row.startDate}
                end={row.expirationDate}
                year={row.year}
                locale={locale}
              />
            ),
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            desktop: 'status',
            sortable: true,
            mobileSortable: false,
            render: (row) => <StatusBadge value={row.operationalStatus} />,
          },
          {
            key: 'actions',
            label: t('admin.columns.action'),
            mobile: 'action',
            sortable: false,
            mobileSortable: false,
            className: 'data-table__column--actions',
            render: (row) => (
              // stopPropagation: la fila entera navega a la ficha del atleta, y
              // estas acciones no deberían arrastrar al operador con ellas.
              <div
                className="admin-membership-actions"
                onClick={(event) => event.stopPropagation()}
                role="presentation"
              >
                {row.canViewCredential && (
                  <AdminIconButton
                    className={credentialTarget?.id === row.id ? 'is-active' : ''}
                    icon={QrCode}
                    label={t('admin.sections.memberships.viewCredential')}
                    onClick={() =>
                      setCredentialTarget({ id: row.id, athleteName: row.athlete })
                    }
                    variant="ghost"
                  />
                )}
                {canManage && row.canActivate && (
                  <AdminIconButton
                    disabled={pendingId === row.id}
                    icon={pendingId === row.id ? LoaderCircle : CircleCheck}
                    label={
                      pendingId === row.id
                        ? t('admin.sections.memberships.applying')
                        : t('admin.sections.memberships.activate')
                    }
                    onClick={() => applyStatus(row.id, 'activa')}
                    variant="celeste"
                  />
                )}
                {canManage && row.canCancel && (
                  <AdminIconButton
                    disabled={pendingId === row.id}
                    icon={pendingId === row.id ? LoaderCircle : Ban}
                    label={
                      pendingId === row.id
                        ? t('admin.sections.memberships.applying')
                        : t('admin.sections.memberships.cancel')
                    }
                    onClick={() => {
                      setActionError('')
                      setCancelTarget(row)
                    }}
                    variant="ghost"
                  />
                )}
                {canDelete && (
                  <AdminIconButton
                    disabled={pendingId === row.id}
                    icon={Trash2}
                    label="Eliminar afiliación"
                    onClick={() => {
                      setActionError('')
                      setDeleteTarget(row)
                    }}
                    variant="danger"
                  />
                )}
              </div>
            ),
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.memberships.empty')}
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable data-table__row--membership"
      />

      {actionError ? (
        <p className="form-submit-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {credentialTarget ? (
        <MembershipCredentialModal
          athleteName={credentialTarget.athleteName}
          canRotate={canManage}
          membershipId={credentialTarget.id}
          onClose={() => setCredentialTarget(null)}
        />
      ) : null}

      {cancelTarget ? (
        <AdminDeleteConfirmDialog
          busy={pendingId === cancelTarget.id}
          error={actionError}
          onCancel={() => {
            if (pendingId !== cancelTarget.id) setCancelTarget(null)
          }}
          onConfirm={() => applyStatus(cancelTarget.id, 'cancelada')}
          title={t('admin.sections.memberships.cancelConfirmTitle')}
          description={t('admin.sections.memberships.cancelConfirmDescription', {
            athlete: cancelTarget.athlete,
          })}
          warning={t('admin.sections.memberships.cancelConfirmWarning')}
          cancelLabel={t('admin.sections.memberships.keepActive')}
          confirmLabel={t('admin.sections.memberships.confirmCancel')}
          busyLabel={t('admin.sections.memberships.applying')}
        />
      ) : null}

      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={pendingId === deleteTarget.id}
          error={actionError}
          onCancel={() => {
            if (pendingId !== deleteTarget.id) setDeleteTarget(null)
          }}
          onConfirm={deleteMembership}
          title="Eliminar afiliación"
          description={`Vas a eliminar definitivamente la afiliación de ${deleteTarget.athlete}.`}
          warning="Se quitarán sus ciclos y suscripciones operativas. Los pagos y la auditoría se conservan."
          cancelLabel="Cancelar"
          confirmLabel="Eliminar definitivamente"
          busyLabel="Eliminando…"
        />
      ) : null}
    </AdminListSection>
  )
}
