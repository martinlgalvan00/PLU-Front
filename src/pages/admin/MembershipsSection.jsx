import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BadgeCheck, Ban, QrCode, Trash2 } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminPaymentReconciliationAlert from '../../components/admin/AdminPaymentReconciliationAlert.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminSavedViews from '../../components/admin/AdminSavedViews.jsx'
import MembershipCredentialModal from '../../components/admin/MembershipCredentialModal.jsx'
import Pill from '../../components/ui/Pill.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminPeriodCell,
  AdminTableActions,
  AdminTableActionsEmpty,
} from '../../components/admin/AdminTableCells.jsx'
import {
  fetchPlatformFeatureToggles,
  VALIDATION_DISABLED_CODES,
} from '../../services/platformSettingsAdminService.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getMembershipsTourSteps } from '../../lib/adminTourSteps.js'
import {
  MEMBERSHIP_EXPIRING_FILTER_OPTIONS,
  MEMBERSHIP_FILTER_STATUSES,
  MEMBERSHIP_TOURNAMENT_FILTER_OPTIONS,
} from '../../lib/constants.js'
import { formatShortMemberCode } from '../../lib/format.js'
import {
  filterMemberships,
  getMembershipStats,
  MEMBERSHIP_LIFECYCLE,
  projectMembershipStatus,
} from '../../services/membershipService.js'
import { groupRegistrationsByAthlete } from '../../services/registrationAdminService.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'

// Una inscripción cancelada o todavía en borrador no cuenta como "inscripto
// a un torneo" — el socio no tiene ahí una participación real en curso.
const NON_TOURNAMENT_REGISTRATION_STATUSES = new Set(['cancelada', 'borrador'])

export default function MembershipsSection({
  memberships,
  registrations = [],
  onSelectAthlete,
  onSetMembershipStatus,
  onDelete,
  canManage = false,
  canDelete = false,
  unreconciledPayments = [],
}) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-memberships', getMembershipsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  const [expiring, setExpiring] = useState('all')
  const [registeredToTournament, setRegisteredToTournament] = useState('all')
  const { views: savedViews, saveView, removeView } = useAdminSavedFilterViews('memberships')
  // Credencial abierta en modal. Guardamos id + nombre para el encabezado
  // sin esperar al fetch; solo una abierta a la vez.
  const [credentialTarget, setCredentialTarget] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  // Default abierto: si el GET falla no bloqueamos la pantalla. Un `false`
  // explícito del interruptor es lo único que congela Activar / Dar de baja.
  const [validationEnabled, setValidationEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchPlatformFeatureToggles()
      .then((toggles) => {
        if (!cancelled) setValidationEnabled(toggles.membershipValidationEnabled !== false)
      })
      .catch(() => {
        if (!cancelled) setValidationEnabled(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function applyStatus(membershipId, nextStatus) {
    if (!validationEnabled) {
      setActionError(t('admin.sections.memberships.validationPaused'))
      return false
    }
    setPendingId(membershipId)
    setActionError('')
    try {
      const result = await onSetMembershipStatus?.(membershipId, nextStatus)
      if (result?.error) {
        // El toggle pudo apagarse después de montar la sección (el fetch de
        // arriba corre una sola vez al entrar): si el backend confirma que la
        // validación está pausada, sincronizamos el estado local -- así el
        // callout y los botones deshabilitados quedan al día en vez de dejar
        // el 409 crudo como único rastro.
        if (result.code === VALIDATION_DISABLED_CODES.membership) {
          setValidationEnabled(false)
          setActionError(t('admin.sections.memberships.validationPaused'))
        } else {
          setActionError(result.error)
        }
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

  // Inscripciones agrupadas por atleta, una sola pasada (mismo patrón que
  // AthletesSection): responder "¿este socio está inscripto a un torneo?"
  // no debería recorrer todo `registrations` por cada afiliación.
  const registrationsByAthlete = useMemo(
    () => groupRegistrationsByAthlete(registrations),
    [registrations],
  )

  // Proyecta lifecycle + operationalStatus + si tiene inscripción vigente a
  // un torneo, todo en una sola pasada por afiliación: antes lifecycle y
  // operationalStatus se recalculaban por separado en statusCounts, adentro
  // de filterMemberships y de nuevo al armar cada fila visible.
  const projectedMemberships = useMemo(
    () =>
      memberships.map((item) => {
        const athleteRegistrations = registrationsByAthlete.get(item.athleteId)
        const hasTournamentRegistration = Boolean(
          athleteRegistrations?.some(
            (registration) => !NON_TOURNAMENT_REGISTRATION_STATUSES.has(registration.status),
          ),
        )
        return { ...item, ...projectMembershipStatus(item), hasTournamentRegistration }
      }),
    [memberships, registrationsByAthlete],
  )

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const item of projectedMemberships) {
      counts[item.operationalStatus] = (counts[item.operationalStatus] ?? 0) + 1
    }
    return counts
  }, [projectedMemberships])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(MEMBERSHIP_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? memberships.length : (statusCounts[value] ?? 0),
      ]),
    [memberships.length, statusCounts, t],
  )

  const metrics = useMemo(() => getMembershipStats(memberships), [memberships])

  const expiringOptions = useMemo(
    () =>
      translateFilterOptions(MEMBERSHIP_EXPIRING_FILTER_OPTIONS, t).map(([value, label]) =>
        value === 'soon'
          ? [value, t('admin.stats.expiringSoon'), metrics.expiringSoon]
          : [value, label],
      ),
    [metrics.expiringSoon, t],
  )

  const tournamentRegisteredCount = useMemo(
    () => projectedMemberships.filter((item) => item.hasTournamentRegistration).length,
    [projectedMemberships],
  )

  const tournamentOptions = useMemo(
    () =>
      translateFilterOptions(MEMBERSHIP_TOURNAMENT_FILTER_OPTIONS, t).map(([value, label]) =>
        value === 'yes' ? [value, label, tournamentRegisteredCount] : [value, label],
      ),
    [tournamentRegisteredCount, t],
  )

  const savedViewSnapshot = useMemo(
    () => ({ query, status, expiring, registeredToTournament }),
    [query, status, expiring, registeredToTournament],
  )
  const activeSavedView = useMemo(
    () => findMatchingView(savedViews, savedViewSnapshot),
    [savedViews, savedViewSnapshot],
  )
  const hasFiltersToSave =
    query.trim() !== '' || status !== 'all' || expiring !== 'all' || registeredToTournament !== 'all'

  function applySavedView(view) {
    setQuery(view.snapshot.query ?? '')
    setStatus(view.snapshot.status ?? 'all')
    setExpiring(view.snapshot.expiring ?? 'all')
    setRegisteredToTournament(view.snapshot.registeredToTournament ?? 'all')
  }

  function clearSavedView() {
    setQuery('')
    setStatus('all')
    setExpiring('all')
    setRegisteredToTournament('all')
  }

  const rows = useMemo(
    () =>
      filterMemberships(projectedMemberships, {
        query,
        status,
        expiring,
        registeredToTournament,
      }).map((item) => ({
        id: item.id,
        athlete: item.athlete?.fullName ?? '—',
        athleteId: item.athleteId,
        document: item.athlete?.documentId ?? '—',
        gym: item.athlete?.gym ?? '',
        photoUrl: item.athlete?.photoUrl ?? null,
        memberCode: item.memberCode,
        year: item.year,
        status: item.status,
        operationalStatus: item.operationalStatus,
        lifecycle: item.lifecycle,
        hasTournamentRegistration: item.hasTournamentRegistration,
        startDate: item.startDate,
        expirationDate: item.expirationDate,
        canViewCredential: [MEMBERSHIP_LIFECYCLE.CURRENT, MEMBERSHIP_LIFECYCLE.EXPIRING].includes(
          item.lifecycle,
        ),
        canActivate: item.status !== 'activa' && item.lifecycle !== MEMBERSHIP_LIFECYCLE.REFUNDED,
        canCancel: [
          MEMBERSHIP_LIFECYCLE.CURRENT,
          MEMBERSHIP_LIFECYCLE.EXPIRING,
          MEMBERSHIP_LIFECYCLE.SCHEDULED,
        ].includes(item.lifecycle),
      })),
    [projectedMemberships, query, status, expiring, registeredToTournament],
  )

  // Métricas de gestión, no un recuento de estados: lo que el admin necesita
  // saber de un vistazo es cuántos socios cubre hoy la afiliación, cuántos
  // entraron este mes, a quiénes hay que ir a renovar y cuánto quedó trabado
  // esperando pago.
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
    <>
      <AdminPaymentReconciliationAlert
        entries={unreconciledPayments}
        onSelectAthlete={onSelectAthlete}
      />
      {!validationEnabled ? (
        <div className="admin-payments-ops-callout" role="status">
          <AlertTriangle size={16} aria-hidden />
          <div className="admin-payments-ops-callout__body">
            <strong>{t('admin.sections.memberships.validationPaused')}</strong>
            <p>{t('admin.sections.memberships.validationPausedLead')}</p>
          </div>
        </div>
      ) : null}
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
            ariaLabel: t('admin.filters.expiringSoon'),
            value: expiring,
            onChange: setExpiring,
            options: expiringOptions,
            variant: 'toggle',
          },
          {
            id: 'registeredToTournament',
            label: t('admin.filters.registeredToTournament'),
            ariaLabel: t('admin.filters.registeredToTournament'),
            value: registeredToTournament,
            onChange: setRegisteredToTournament,
            options: tournamentOptions,
            variant: 'toggle',
            advanced: true,
          },
        ]}
        onQueryChange={setQuery}
        beforeFilters={
          <AdminSavedViews
            views={savedViews}
            activeViewId={activeSavedView?.id ?? null}
            allLabel={t('admin.savedViews.all')}
            caption={t('admin.savedViews.caption')}
            addLabel={t('admin.savedViews.add')}
            namePlaceholder={t('admin.savedViews.namePlaceholder')}
            removeAriaLabel={(label) => t('admin.savedViews.remove', { label })}
            canSave={hasFiltersToSave && !activeSavedView}
            onApply={applySavedView}
            onClear={clearSavedView}
            onSave={(label) => saveView(label, savedViewSnapshot)}
            onRemove={removeView}
          />
        }
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
                <AdminIdentityCell
                  accent="gold"
                  name={row.athlete}
                  photoUrl={row.photoUrl}
                  sub={row.gym || row.document}
                  subMono={!row.gym}
                />
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
              sortAccessor: (row) =>
                `${row.operationalStatus}${row.hasTournamentRegistration ? '-1' : '-0'}`,
              render: (row) => (
                <div className="admin-membership-status-cell">
                  <StatusBadge value={row.operationalStatus} />
                  {row.hasTournamentRegistration ? (
                    <Pill tone="info">
                      {t('admin.sections.memberships.registeredToTournamentBadge')}
                    </Pill>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
              sortable: false,
              mobileSortable: false,
              className: 'data-table__column--actions',
              render: (row) => {
                const hasActions =
                  row.canViewCredential ||
                  (canManage && row.canActivate) ||
                  (canManage && row.canCancel) ||
                  canDelete
                if (!hasActions) return <AdminTableActionsEmpty />
                const pausedLabel = t('admin.sections.memberships.validationPaused')
                // stopPropagation: la fila entera navega a la ficha del atleta.
                return (
                  <AdminTableActions
                    className="admin-membership-actions"
                    onClick={(event) => event.stopPropagation()}
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
                        disabled={pendingId === row.id || !validationEnabled}
                        icon={BadgeCheck}
                        spinning={pendingId === row.id}
                        label={
                          pendingId === row.id
                            ? t('admin.sections.memberships.applying')
                            : validationEnabled
                              ? t('admin.sections.memberships.activate')
                              : pausedLabel
                        }
                        onClick={() => applyStatus(row.id, 'activa')}
                        variant="celeste"
                      />
                    )}
                    {canManage && row.canCancel && (
                      <AdminIconButton
                        disabled={pendingId === row.id || !validationEnabled}
                        icon={Ban}
                        spinning={pendingId === row.id}
                        label={
                          pendingId === row.id
                            ? t('admin.sections.memberships.applying')
                            : validationEnabled
                              ? t('admin.sections.memberships.cancel')
                              : pausedLabel
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
                  </AdminTableActions>
                )
              },
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
    </>
  )
}
