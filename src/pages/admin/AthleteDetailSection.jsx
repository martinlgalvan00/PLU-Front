import { useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleAlert, Pencil, Route, Trash2, X } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminAthleteActivity from '../../components/admin/AdminAthleteActivity.jsx'
import AdminMembershipCredential from '../../components/admin/AdminMembershipCredential.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { EntitlementStateCell, PaymentStateCell } from '../../components/admin/AdminStateCell.jsx'
import ObservationsThread from '../../components/admin/ObservationsThread.jsx'
import PaymentTraceDialog from '../../components/admin/PaymentTraceDialog.jsx'
import PaymentValidationAction from '../../components/admin/PaymentValidationAction.jsx'
import MemberProfileCard from '../../components/ui/MemberProfileCard.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { ATHLETE_FILTER_STATUSES, PAYMENT_METHODS } from '../../lib/constants.js'
import { money } from '../../lib/format.js'
import { actorLabel, formatStateDateTime } from '../../lib/stateProvenance.js'
import { canValidateManualOrder } from '../../services/paymentValidationService.js'
import {
  findAthleteStateDivergences,
  isPlaceholderReason,
  resolveStateBacking,
} from '../../services/stateCoherenceService.js'

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

export default function AthleteDetailSection({
  detail,
  onBack,
  canEdit,
  canRotateCredential = false,
  canDelete = false,
  canValidatePayments = false,
  onDelete,
  onUpdate,
  onApprovePayment,
  onRejectPayment,
}) {
  const { locale, t } = useI18n()
  const [activeTab, setActiveTab] = useState('profile')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [traceOrderId, setTraceOrderId] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editGym, setEditGym] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const { athlete, memberships = [], registrations = [], payments = [] } = detail ?? {}

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(ATHLETE_FILTER_STATUSES, t).filter(([value]) => value !== 'all'),
    [t],
  )
  // Derechos otorgados sobre un cobro que no los respalda. Es lo que hacía que
  // la ficha se contradijera entre dos tabs sin decir por qué: se resuelve una
  // vez acá y lo consumen el aviso de arriba y las tres tablas.
  const divergences = useMemo(
    () => findAthleteStateDivergences({ memberships, registrations, payments }),
    [memberships, registrations, payments],
  )
  // Las que todavía nadie explicó son las accionables. Una divergencia con
  // motivo escrito es una decisión operativa registrada, no un pendiente.
  const unexplainedDivergences = useMemo(
    () => divergences.filter((item) => !item.backing.explained),
    [divergences],
  )
  // `resolveStateBacking` y no `resolveEntitlementBacking`: la divergencia sólo
  // existe sobre un derecho otorgado, pero el motivo escrito a mano existe en
  // cualquier estado -- y `observada` es justamente el que se pone para dejarlo
  // escrito. Con la versión anterior la observación se guardaba y la ficha
  // mostraba un badge pelado.
  const backingByEntityId = useMemo(() => {
    const index = new Map()
    for (const entity of [...memberships, ...registrations]) {
      const backing = resolveStateBacking(entity, payments)
      if (backing) index.set(entity.id, backing)
    }
    return index
  }, [memberships, registrations, payments])

  const activeMembership = memberships.find((item) => item.status === 'activa')
  // La credencial vigente es la de la afiliación activa; si no hay ninguna, se
  // muestra la última emitida para poder cotejar un QR viejo.
  const credentialMembership = activeMembership ?? memberships[0] ?? null

  const tabs = useMemo(
    () => [
      { id: 'profile', label: t('admin.athleteDetail.tabs.profile') },
      {
        id: 'memberships',
        label: t('admin.athleteDetail.tabs.memberships'),
        count: memberships.length,
      },
      {
        id: 'registrations',
        label: t('admin.athleteDetail.tabs.registrations'),
        count: registrations.length,
      },
      { id: 'payments', label: t('admin.athleteDetail.tabs.payments'), count: payments.length },
      { id: 'credential', label: t('admin.athleteDetail.tabs.credential') },
      { id: 'activity', label: t('admin.athleteDetail.tabs.activity') },
    ],
    [memberships.length, payments.length, registrations.length, t],
  )

  const profileGroups = useMemo(
    () => [
      {
        id: 'contact',
        title: t('admin.athleteDetail.groups.contact'),
        fields: [
          {
            key: 'document',
            label: t('admin.athleteDetail.fields.document'),
            value: athlete?.documentId,
          },
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
          {
            key: 'division',
            label: t('admin.athleteDetail.fields.division'),
            value: athlete?.division,
          },
          {
            key: 'category',
            label: t('admin.athleteDetail.fields.category'),
            value: athlete?.category,
          },
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

  function closeDeleteDialog() {
    if (deleteBusy) return
    setIsDeleteDialogOpen(false)
    setDeleteError('')
  }

  async function handleDeleteAthlete() {
    if (!onDelete || !athlete?.id) return
    setDeleteError('')
    setDeleteBusy(true)
    try {
      // En éxito el panel vuelve al listado (el atleta ya no existe) y esta
      // vista se desmonta: no hay estado que limpiar.
      await onDelete(athlete.id)
    } catch (error) {
      setDeleteError(error?.message ?? t('admin.athleteDetail.delete.error'))
      setDeleteBusy(false)
    }
  }

  function openEdit() {
    setEditStatus(athlete.status ?? '')
    setEditGym(athlete.gym ?? '')
    setEditError('')
    setIsEditOpen(true)
  }

  function closeEdit() {
    if (editBusy) return
    setIsEditOpen(false)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!onUpdate || !athlete?.id) return
    setEditError('')
    setEditBusy(true)
    try {
      await onUpdate(athlete.id, { status: editStatus, gym: editGym.trim() })
      setIsEditOpen(false)
    } catch (error) {
      setEditError(error?.message ?? t('admin.athleteDetail.edit.error'))
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <div className="athlete-detail">
      <div className="athlete-detail__toolbar">
        <button type="button" className="athlete-detail__back" onClick={onBack}>
          <span className="athlete-detail__back-icon" aria-hidden="true">
            <ArrowLeft size={15} strokeWidth={2.25} />
          </span>
          <span>{t('admin.athleteDetail.back')}</span>
        </button>

        {canEdit && onUpdate ? (
          <button
            type="button"
            className="athlete-detail__edit-trigger"
            onClick={() => (isEditOpen ? closeEdit() : openEdit())}
          >
            <Pencil size={13} aria-hidden />
            {t('admin.athleteDetail.edit.action')}
          </button>
        ) : null}
      </div>

      <MemberProfileCard
        className="athlete-detail__profile"
        flat
        metaLayout="inline"
        name={athlete.fullName}
        photoUrl={athlete.photoUrl}
        documentId={athlete.documentId}
        gym={athlete.gym}
        status={athlete.status}
        memberCode={activeMembership?.memberCode}
      />

      {/* Divergencia entre el derecho y el cobro que lo respalda. Va arriba y
          antes de los tabs porque es lo primero que hay que saber al abrir la
          ficha: sin esto, el operador descubre la contradicción recién al
          comparar dos tabs a mano, y la lee como un error del sistema.

          Tono `warning` y no `danger` a propósito: en la enorme mayoría de los
          casos no es una falla, es una decisión operativa (la plata entró por
          transferencia y alguien activó a mano). Lo que sí es un pendiente real
          es la que nadie explicó, y esa se distingue por su propio modificador. */}
      {divergences.length ? (
        <section
          className="athlete-detail__divergence"
          data-unexplained={unexplainedDivergences.length ? 'true' : 'false'}
          aria-labelledby="athlete-detail-divergence-title"
        >
          <header className="athlete-detail__divergence-head">
            <CircleAlert size={16} aria-hidden />
            <h3
              id="athlete-detail-divergence-title"
              className="athlete-detail__divergence-title"
            >
              {t(
                unexplainedDivergences.length
                  ? 'admin.athleteDetail.divergence.titleUnexplained'
                  : 'admin.athleteDetail.divergence.title',
              )}
            </h3>
          </header>
          <ul className="athlete-detail__divergence-list">
            {divergences.map(({ kind, entity, backing }) => {
              const manual = backing.manualOverride ?? null
              const actor = actorLabel(manual?.by)
              const hasReason = manual?.reason && !isPlaceholderReason(manual.reason)
              const when = formatStateDateTime(manual?.at, locale) ?? '—'
              const channelLabel = manual?.channel
                ? t(`admin.paymentState.manual.channel.${manual.channel}`)
                : null
              const attribution = [
                actor ?? t('admin.paymentState.manual.unknownActor'),
                when,
                channelLabel,
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <li key={entity.id} className="athlete-detail__divergence-item">
                  <div className="athlete-detail__divergence-compare">
                    <div className="athlete-detail__divergence-side">
                      <span className="athlete-detail__divergence-side-label">
                        {t(`admin.athleteDetail.divergence.kindLabel.${kind}`)}
                      </span>
                      <StatusBadge value={entity.status} />
                    </div>
                    <span className="athlete-detail__divergence-bridge" aria-hidden>
                      ↔
                    </span>
                    <div className="athlete-detail__divergence-side">
                      <span className="athlete-detail__divergence-side-label">
                        {t('admin.athleteDetail.divergence.paymentLabel')}
                      </span>
                      <StatusBadge value={backing.order?.status} />
                    </div>
                  </div>
                  {hasReason ? (
                    <blockquote className="athlete-detail__divergence-quote">
                      <span className="athlete-detail__divergence-quote-label">
                        {t('admin.observations.title')}
                      </span>
                      <p>{manual.reason}</p>
                      <footer>
                        <cite title={attribution}>{attribution}</cite>
                      </footer>
                    </blockquote>
                  ) : (
                    <p className="athlete-detail__divergence-note athlete-detail__divergence-note--gap">
                      {t('admin.athleteDetail.divergence.unexplained')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {isEditOpen ? (
        <div className="athlete-detail__edit-panel">
          <label className="athlete-detail__edit-field">
            <span>{t('admin.athleteDetail.edit.fieldStatus')}</span>
            <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} disabled={editBusy}>
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="athlete-detail__edit-field athlete-detail__edit-field--grow">
            <span>{t('admin.athleteDetail.edit.fieldGym')}</span>
            <input
              type="text"
              value={editGym}
              onChange={(event) => setEditGym(event.target.value)}
              disabled={editBusy}
            />
          </label>
          <div className="athlete-detail__edit-actions">
            <Button type="button" disabled={editBusy} onClick={handleSaveEdit}>
              <Check size={14} aria-hidden />
              {editBusy ? t('admin.athleteDetail.edit.saving') : t('admin.athleteDetail.edit.save')}
            </Button>
            <button type="button" className="athlete-detail__edit-cancel" disabled={editBusy} onClick={closeEdit}>
              <X size={14} aria-hidden />
              {t('admin.athleteDetail.edit.cancel')}
            </button>
          </div>
          {editError ? <p className="athlete-detail__edit-error">{editError}</p> : null}
        </div>
      ) : null}

      <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="editorial" />

      {activeTab === 'profile' && (
        <>
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

          {canDelete ? (
            <section
              className="athlete-detail__danger"
              aria-labelledby="athlete-detail-danger-title"
            >
              <div className="athlete-detail__danger-copy">
                <h3 id="athlete-detail-danger-title">{t('admin.athleteDetail.delete.title')}</h3>
                <p>{t('admin.athleteDetail.delete.description')}</p>
              </div>
              <Button
                type="button"
                variant="danger"
                className="athlete-detail__danger-action"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 size={15} aria-hidden />
                {t('admin.athleteDetail.delete.action')}
              </Button>
            </section>
          ) : null}
        </>
      )}

      {activeTab === 'memberships' && (
        <div className="athlete-detail__panel">
          <AdminDataTable
            columns={[
              {
                key: 'year',
                label: t('admin.columns.year'),
                mobile: 'primary',
                desktop: 'numeric',
                align: 'end',
              },
              {
                key: 'status',
                label: t('admin.columns.status'),
                mobile: 'badge',
                render: (row) => (
                  <EntitlementStateCell
                    backing={backingByEntityId.get(row.id)}
                    status={row.status}
                  />
                ),
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
                render: (row) => (
                  <EntitlementStateCell
                    backing={backingByEntityId.get(row.id)}
                    status={row.status}
                  />
                ),
              },
            ]}
            rows={registrations}
            emptyMessage={t('admin.athleteDetail.emptyRegistrations')}
          />
          {/* El hilo de cada inscripción, debajo de la tabla. Va acá y no en un
              modal porque la ficha es donde se estudia un caso: se lee la
              inscripción y lo que se dijo sobre ella sin abrir nada. Con varias
              inscripciones se apilan, encabezada cada una por su evento. */}
          {registrations.map((registration) => (
            <section className="athlete-detail__observations" key={registration.id}>
              <h4 className="athlete-detail__observations-title">
                {t('admin.observations.title')}
                <span>{registration.event}</span>
              </h4>
              <ObservationsThread
                canWrite={canEdit}
                entityId={registration.id}
                entityType="registration"
              />
            </section>
          ))}
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
                render: (row) => <PaymentStateCell payment={row} />,
              },
              {
                key: 'createdAt',
                label: t('admin.columns.date'),
                render: (row) => formatDateTime(row.createdAt, locale),
                sortAccessor: (row) => row.createdAt ?? '',
                sortable: true,
                defaultSort: 'desc',
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
                      icon={Route}
                      label={t('admin.paymentTrace.open')}
                      onClick={() => setTraceOrderId(row.id)}
                      variant="ghost"
                    />
                    {/* Antes esto era `onApprovePayment(row.id)` a secas: la
                        ficha acreditaba sin abrir el comprobante y descartaba
                        el resultado, así que un 403 o el interruptor de
                        validación apagado no dejaban rastro en pantalla. El
                        botón además se habilitaba con `admin.athletes.write`,
                        que no alcanza para mover plata. */}
                    <PaymentValidationAction
                      athlete={athlete}
                      detail={[row.concept, row.reference].filter(Boolean).join(' · ')}
                      disabled={!canValidatePayments || !canValidateManualOrder(row)}
                      onApprove={onApprovePayment}
                      onReject={onRejectPayment}
                      order={row}
                    />
                  </AdminTableActions>
                ),
              },
            ]}
            rows={payments}
            emptyMessage={t('admin.athleteDetail.emptyPayments')}
          />
          {traceOrderId ? (
            <PaymentTraceDialog orderId={traceOrderId} onClose={() => setTraceOrderId(null)} />
          ) : null}
        </div>
      )}

      {activeTab === 'credential' && (
        <div className="surface-card surface-card--flat athlete-detail__credential">
          <AdminMembershipCredential
            membershipId={credentialMembership?.id ?? null}
            canRotate={canRotateCredential}
          />
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="surface-card surface-card--flat athlete-detail__timeline">
          <AdminAthleteActivity
            athleteId={athlete?.id}
            memberships={memberships}
            registrations={registrations}
            payments={payments}
          />
        </div>
      )}

      {isDeleteDialogOpen ? (
        <AdminDeleteConfirmDialog
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDeleteAthlete()}
          title={t('admin.athleteDetail.delete.confirmTitle')}
          description={t('admin.athleteDetail.delete.confirmDescription', {
            name: athlete.fullName,
            documentId: athlete.documentId,
            memberships: memberships.length,
            registrations: registrations.length,
            payments: payments.length,
          })}
          warning={t('admin.athleteDetail.delete.warning')}
          cancelLabel={t('admin.athleteDetail.delete.cancel')}
          confirmLabel={t('admin.athleteDetail.delete.confirm')}
          busyLabel={t('admin.athleteDetail.delete.deleting')}
        />
      ) : null}
    </div>
  )
}
