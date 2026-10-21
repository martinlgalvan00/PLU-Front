import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, XCircle } from 'lucide-react'
import AdminDeleteConfirmDialog from '../AdminDeleteConfirmDialog.jsx'
import { notifyError, notifySuccess } from '../../../lib/adminToast.js'
import {
  createPaymentProfile,
  deletePaymentProfile,
  fetchPaymentProfiles,
  refreshMercadoPagoProfile,
  updatePaymentProfile,
} from '../../../services/paymentProfileService.js'
import MercadoPagoAccountStatus from './MercadoPagoAccountStatus.jsx'
import MercadoPagoConnectControl from './MercadoPagoConnectControl.jsx'
import { mercadoPagoAccountStatus, paymentAccountHolder } from './paymentAccountText.js'
import '../../../styles/components/admin-payment-accounts.css'

const EMPTY_BANK = { name: '', alias: '', cbu: '', holder: '', notes: '' }

function isInUse(usage) {
  return Boolean(usage && (usage.events?.length > 0 || usage.shop || usage.pinnedOrders > 0))
}

function apiMessage(error, fallback) {
  // Los 5xx llegan opacos a propósito: ahí sirve el texto propio.
  return error?.status && error.status < 500 && error.message ? error.message : fallback
}

/**
 * Cuentas de cobro de la organización: cuentas de Mercado Pago (vinculadas por
 * OAuth o cargadas a mano) y cuentas bancarias para transferencia. Alta,
 * edición, renovación, archivo y baja en un solo lugar; cada evento después
 * elige cuál usa desde su editor.
 *
 * Composición: flujo abierto dentro del bloque de "Acceso y habilitación".
 * En ancho, Mercado Pago y bancos van en columnas; en angosto se apilan.
 * Cada fila dice quién cobra, si puede seguir cobrando y dónde se usa; las
 * acciones van a la derecha. Sin tarjetas.
 */
export default function PaymentAccountsPanel({ t, locale = 'es', canEdit = false }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    mercadoPago: [],
    bank: [],
    oauth: { available: false, missing: [] },
  })
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // { id|null, kind, draft }
  const [formError, setFormError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const [mp, bank] = await Promise.all([
        fetchPaymentProfiles({ kind: 'mercado_pago', includeArchived: true, includeUsage: true }),
        fetchPaymentProfiles({ kind: 'bank_transfer', includeArchived: true, includeUsage: true }),
      ])
      setState({
        loading: false,
        error: null,
        mercadoPago: mp.profiles,
        bank: bank.profiles,
        oauth: mp.mercadoPagoOAuth,
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: apiMessage(error, t('admin.paymentAccounts.loadError')),
      }))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useCallback(
    (profiles) => (showArchived ? profiles : profiles.filter((profile) => profile.active)),
    [showArchived],
  )
  const mercadoPago = useMemo(() => visible(state.mercadoPago), [visible, state.mercadoPago])
  const bank = useMemo(() => visible(state.bank), [visible, state.bank])

  /** Cuentas OAuth que ya no pueden cobrar y los eventos que las usan. */
  const reconnectAlerts = useMemo(() => {
    return state.mercadoPago
      .filter(
        (profile) =>
          profile.active !== false && mercadoPagoAccountStatus(profile) === 'needs_reconnect',
      )
      .map((profile) => ({
        profile,
        events: profile.usage?.events ?? [],
      }))
  }, [state.mercadoPago])

  function usageText(usage) {
    const events = usage?.events ?? []
    const parts = []
    if (events.length > 0) {
      const names = events
        .slice(0, 3)
        .map((event) => event.title)
        .join(', ')
      parts.push(
        `${t(
          events.length === 1
            ? 'admin.paymentAccounts.usageEvents_one'
            : 'admin.paymentAccounts.usageEvents_other',
          { count: events.length },
        )}: ${names}${
          events.length > 3 ? '…' : ''
        }`,
      )
    }
    if (usage?.shop) parts.push(t('admin.paymentAccounts.usageShop'))
    return parts.length > 0 ? parts.join(' · ') : t('admin.paymentAccounts.usageNone')
  }

  async function runAction(profileId, action, successMessage) {
    setBusyId(profileId)
    try {
      const result = await action()
      if (successMessage) notifySuccess(successMessage(result))
      await load()
      return result
    } catch (error) {
      notifyError(apiMessage(error, t('admin.paymentAccounts.oauthErrorGeneric')))
      return null
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(profile, kind) {
    setFormError(null)
    if (!profile) {
      setEditing({ id: null, kind, draft: { ...EMPTY_BANK } })
      return
    }
    setEditing({
      id: profile.id,
      kind,
      draft: {
        name: profile.name ?? '',
        alias: profile.config?.alias ?? '',
        cbu: profile.config?.cbu ?? '',
        holder: profile.config?.holder ?? '',
        notes: profile.config?.notes ?? '',
      },
    })
  }

  async function submitEdit(event) {
    event.preventDefault()
    if (!editing) return
    const { id, kind, draft } = editing
    if (draft.name.trim().length < 2) {
      setFormError(t('admin.paymentAccounts.errorNameRequired'))
      return
    }
    if (kind === 'bank_transfer' && !draft.alias.trim()) {
      setFormError(t('admin.paymentAccounts.errorAliasRequired'))
      return
    }
    const config =
      kind === 'bank_transfer'
        ? {
            alias: draft.alias.trim(),
            cbu: draft.cbu.trim(),
            holder: draft.holder.trim(),
            notes: draft.notes.trim(),
          }
        : { notes: draft.notes.trim() }
    setBusyId(id ?? 'new')
    try {
      if (id) await updatePaymentProfile(id, { name: draft.name.trim(), config })
      else await createPaymentProfile({ name: draft.name.trim(), kind, config })
      notifySuccess(t('admin.paymentAccounts.saved'))
      setEditing(null)
      await load()
    } catch (error) {
      setFormError(apiMessage(error, t('admin.paymentAccounts.oauthErrorGeneric')))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    setDeleteError(null)
    try {
      await deletePaymentProfile(deleteTarget.id)
      notifySuccess(t('admin.paymentAccounts.deleted'))
      setDeleteTarget(null)
      await load()
    } catch (error) {
      setDeleteError(
        error?.body?.code === 'PAYMENT_PROFILE_IN_USE'
          ? t('admin.paymentAccounts.deleteInUse')
          : apiMessage(error, t('admin.paymentAccounts.oauthErrorGeneric')),
      )
    } finally {
      setBusyId(null)
    }
  }

  function renderForm(kind) {
    if (!editing || editing.kind !== kind) return null
    const { draft } = editing
    const setField = (field) => (changeEvent) =>
      setEditing({ ...editing, draft: { ...draft, [field]: changeEvent.target.value } })
    const formId = `payment-account-form-${editing.id ?? 'new'}`
    const title =
      kind === 'mercado_pago'
        ? t('admin.paymentAccounts.mpFormTitleEdit')
        : editing.id
          ? t('admin.paymentAccounts.bankFormTitleEdit')
          : t('admin.paymentAccounts.bankFormTitleNew')
    return (
      <form
        className="admin-access__form payment-accounts__form"
        onSubmit={(submitEvent) => void submitEdit(submitEvent)}
        aria-labelledby={`${formId}-title`}
      >
        <header>
          <h3 id={`${formId}-title`}>{title}</h3>
          <p>
            {kind === 'mercado_pago'
              ? t('admin.paymentAccounts.mpFormHint')
              : t('admin.paymentAccounts.bankFormHint')}
          </p>
        </header>
        <fieldset className="admin-access__fields">
          <label htmlFor={`${formId}-name`}>
            <span>{t('admin.paymentAccounts.fieldName')}</span>
            <input
              id={`${formId}-name`}
              value={draft.name}
              onChange={setField('name')}
              maxLength={120}
              required
            />
          </label>
          {kind === 'bank_transfer' ? (
            <>
              <label htmlFor={`${formId}-alias`}>
                <span>{t('admin.paymentAccounts.fieldAlias')}</span>
                <input
                  id={`${formId}-alias`}
                  value={draft.alias}
                  onChange={setField('alias')}
                  maxLength={120}
                  autoComplete="off"
                  required
                />
              </label>
              <label htmlFor={`${formId}-cbu`}>
                <span>{t('admin.paymentAccounts.fieldCbu')}</span>
                <input
                  id={`${formId}-cbu`}
                  value={draft.cbu}
                  onChange={setField('cbu')}
                  maxLength={30}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <label htmlFor={`${formId}-holder`}>
                <span>{t('admin.paymentAccounts.fieldHolder')}</span>
                <input
                  id={`${formId}-holder`}
                  value={draft.holder}
                  onChange={setField('holder')}
                  maxLength={160}
                />
              </label>
            </>
          ) : null}
          <label htmlFor={`${formId}-notes`}>
            <span>{t('admin.paymentAccounts.fieldNotes')}</span>
            <input
              id={`${formId}-notes`}
              value={draft.notes}
              onChange={setField('notes')}
              maxLength={500}
            />
          </label>
        </fieldset>
        {formError ? (
          <p className="admin-access__error" role="alert">
            <XCircle size={15} aria-hidden /> {formError}
          </p>
        ) : null}
        <footer className="admin-access__form-actions">
          <button type="button" className="admin-access__btn" onClick={() => setEditing(null)}>
            {t('admin.paymentAccounts.cancel')}
          </button>
          <button
            type="submit"
            className="admin-access__btn admin-access__btn--primary"
            disabled={busyId === (editing.id ?? 'new')}
          >
            {busyId === (editing.id ?? 'new')
              ? t('admin.paymentAccounts.saving')
              : t('admin.paymentAccounts.save')}
          </button>
        </footer>
      </form>
    )
  }

  function renderActions(profile, kind) {
    if (!canEdit) return null
    const busy = busyId === profile.id
    const isOAuth = kind === 'mercado_pago' && profile.config?.connection === 'oauth'
    const status = kind === 'mercado_pago' ? mercadoPagoAccountStatus(profile) : null
    const inUse = isInUse(profile.usage)
    const small = 'admin-access__btn admin-access__btn--small admin-access__btn--ghost'
    return (
      <div
        className="payment-accounts__actions"
        role="group"
        aria-label={t('admin.paymentAccounts.actionsLabel', { name: profile.name })}
      >
        {profile.active ? (
          <button
            type="button"
            className={small}
            disabled={busy}
            onClick={() => startEdit(profile, kind)}
          >
            {t('admin.paymentAccounts.edit')}
          </button>
        ) : null}
        {profile.active && isOAuth && state.oauth.available ? (
          status === 'needs_reconnect' || status === 'expiring' ? (
            <MercadoPagoConnectControl
              t={t}
              profileId={profile.id}
              label={t('admin.paymentAccounts.reconnect')}
              buttonClassName={small}
              disabled={busy}
              onConnected={() => {
                notifySuccess(t('admin.paymentAccounts.reconnected'))
                void load()
              }}
            />
          ) : (
            <button
              type="button"
              className={small}
              disabled={busy}
              onClick={() =>
                void runAction(
                  profile.id,
                  () => refreshMercadoPagoProfile(profile.id),
                  (result) =>
                    result?.needsReconnect
                      ? t('admin.paymentAccounts.renewNeedsReconnect')
                      : t('admin.paymentAccounts.renewed'),
                )
              }
            >
              <RefreshCw size={13} aria-hidden />
              {t('admin.paymentAccounts.renew')}
            </button>
          )
        ) : null}
        {profile.active ? (
          <button
            type="button"
            className={small}
            disabled={busy}
            onClick={() =>
              void runAction(
                profile.id,
                () => updatePaymentProfile(profile.id, { active: false }),
                () => t('admin.paymentAccounts.archived'),
              )
            }
          >
            {t('admin.paymentAccounts.archive')}
          </button>
        ) : (
          <button
            type="button"
            className={small}
            disabled={busy}
            onClick={() =>
              void runAction(
                profile.id,
                () => updatePaymentProfile(profile.id, { active: true }),
                () => t('admin.paymentAccounts.restored'),
              )
            }
          >
            {t('admin.paymentAccounts.restore')}
          </button>
        )}
        {/* Eliminar solo se ofrece sin referencias: con eventos u órdenes el
            servidor lo rechaza igual y lo correcto es archivar. */}
        {inUse ? null : (
          <button
            type="button"
            className={`${small} payment-accounts__danger`}
            disabled={busy}
            onClick={() => {
              setDeleteError(null)
              setDeleteTarget(profile)
            }}
          >
            {t('admin.paymentAccounts.delete')}
          </button>
        )}
      </div>
    )
  }

  function renderList(profiles, kind) {
    if (profiles.length === 0) {
      return (
        <p className="admin-access__empty">
          {kind === 'mercado_pago'
            ? t('admin.paymentAccounts.emptyMercadoPago')
            : t('admin.paymentAccounts.emptyBank')}
        </p>
      )
    }
    return (
      <ul className="payment-accounts__list">
        {profiles.map((profile) => (
          <li
            key={profile.id}
            className={`payment-accounts__item${profile.active ? '' : ' payment-accounts__item--archived'}`}
          >
            <div className="payment-accounts__head">
              <p className="payment-accounts__name">
                {profile.name}
                {profile.active ? null : (
                  <span className="payment-accounts__tag">
                    {t('admin.paymentAccounts.archivedTag')}
                  </span>
                )}
              </p>
              {renderActions(profile, kind)}
            </div>
            <div className="payment-accounts__main">
              {kind === 'mercado_pago' ? (
                <MercadoPagoAccountStatus t={t} locale={locale} profile={profile} />
              ) : (
                <p className="payment-accounts__detail">
                  {[paymentAccountHolder(profile), profile.config?.cbu].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="payment-accounts__usage">{usageText(profile.usage)}</p>
            </div>
            {editing?.id === profile.id ? renderForm(kind) : null}
          </li>
        ))}
      </ul>
    )
  }

  const archivedCount =
    state.mercadoPago.filter((profile) => !profile.active).length +
    state.bank.filter((profile) => !profile.active).length

  return (
    <section
      className="admin-access__block payment-accounts"
      aria-labelledby="payment-accounts-title"
      aria-busy={state.loading ? 'true' : undefined}
    >
      <header className="admin-access__block-head">
        <div>
          <h2 id="payment-accounts-title">{t('admin.paymentAccounts.title')}</h2>
          <p>{t('admin.paymentAccounts.lead')}</p>
        </div>
        {archivedCount > 0 ? (
          <label className="payment-accounts__toggle" htmlFor="payment-accounts-archived">
            <input
              id="payment-accounts-archived"
              type="checkbox"
              checked={showArchived}
              onChange={(changeEvent) => setShowArchived(changeEvent.target.checked)}
            />
            {t('admin.paymentAccounts.showArchived')}
          </label>
        ) : null}
      </header>

      {state.error ? (
        <div className="admin-access__message admin-access__message--error" role="alert">
          <XCircle size={15} aria-hidden />
          <span>{state.error}</span>
          <button type="button" className="admin-access__btn" onClick={() => void load()}>
            {t('admin.paymentAccounts.retry')}
          </button>
        </div>
      ) : null}

      {state.loading && state.mercadoPago.length === 0 && state.bank.length === 0 ? (
        <p className="admin-access__loading">{t('admin.paymentAccounts.loading')}</p>
      ) : null}

      {!state.loading && !state.error && reconnectAlerts.length > 0 ? (
        <div className="payment-accounts__reconnect-banner" role="alert">
          <p className="payment-accounts__reconnect-title">
            {t(
              reconnectAlerts.length === 1
                ? 'admin.paymentAccounts.reconnectBanner_one'
                : 'admin.paymentAccounts.reconnectBanner_other',
              { count: reconnectAlerts.length },
            )}
          </p>
          <ul className="payment-accounts__reconnect-list">
            {reconnectAlerts.map(({ profile, events }) => {
              const eventNames = events
                .slice(0, 4)
                .map((event) => event.title)
                .join(', ')
              const usage =
                events.length === 0
                  ? t('admin.paymentAccounts.reconnectBannerNoEvents')
                  : t(
                      events.length === 1
                        ? 'admin.paymentAccounts.reconnectBannerEvents_one'
                        : 'admin.paymentAccounts.reconnectBannerEvents_other',
                      {
                        count: events.length,
                        names: `${eventNames}${events.length > 4 ? '…' : ''}`,
                      },
                    )
              return (
                <li key={profile.id} className="payment-accounts__reconnect-item">
                  <div className="payment-accounts__reconnect-copy">
                    <strong>{profile.name}</strong>
                    <span>{usage}</span>
                  </div>
                  {canEdit && state.oauth.available ? (
                    <MercadoPagoConnectControl
                      t={t}
                      profileId={profile.id}
                      label={t('admin.paymentAccounts.reconnect')}
                      buttonClassName="admin-access__btn admin-access__btn--small"
                      onConnected={() => {
                        notifySuccess(t('admin.paymentAccounts.reconnected'))
                        void load()
                      }}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="payment-accounts__columns">
          <div className="payment-accounts__group" role="group" aria-labelledby="payment-accounts-mp-title">
            <header className="payment-accounts__group-head">
              <div className="payment-accounts__group-title">
                <h3 id="payment-accounts-mp-title">{t('admin.paymentAccounts.sectionMercadoPago')}</h3>
                <span className="payment-accounts__count">{mercadoPago.length}</span>
              </div>
              {canEdit && state.oauth.available ? (
                <MercadoPagoConnectControl
                  t={t}
                  buttonClassName="admin-access__btn admin-access__btn--small"
                  onConnected={(result) => {
                    notifySuccess(
                      result.created
                        ? t('admin.paymentAccounts.connected')
                        : t('admin.paymentAccounts.reconnected'),
                    )
                    void load()
                  }}
                />
              ) : null}
            </header>
            {canEdit && !state.oauth.available ? (
              <p className="admin-access__hold">
                {t('admin.paymentAccounts.oauthUnavailable', {
                  missing: state.oauth.missing.join(', '),
                })}
              </p>
            ) : null}
            {renderList(mercadoPago, 'mercado_pago')}
          </div>

          <div className="payment-accounts__group" role="group" aria-labelledby="payment-accounts-bank-title">
            <header className="payment-accounts__group-head">
              <div className="payment-accounts__group-title">
                <h3 id="payment-accounts-bank-title">{t('admin.paymentAccounts.sectionBank')}</h3>
                <span className="payment-accounts__count">{bank.length}</span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="admin-access__btn admin-access__btn--small"
                  onClick={() => startEdit(null, 'bank_transfer')}
                  disabled={editing?.id === null}
                >
                  <Plus size={14} aria-hidden />
                  {t('admin.paymentAccounts.addBank')}
                </button>
              ) : null}
            </header>
            {editing && editing.id === null ? renderForm('bank_transfer') : null}
            {renderList(bank, 'bank_transfer')}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={busyId === deleteTarget.id}
          error={deleteError}
          onCancel={() => {
            if (busyId !== deleteTarget.id) setDeleteTarget(null)
          }}
          onConfirm={() => void confirmDelete()}
          title={t('admin.paymentAccounts.deleteTitle')}
          description={t('admin.paymentAccounts.deleteDescription', { name: deleteTarget.name })}
          warning={
            deleteTarget.config?.connection === 'oauth'
              ? t('admin.paymentAccounts.deleteWarningOAuth')
              : t('admin.paymentAccounts.deleteWarning')
          }
          cancelLabel={t('admin.paymentAccounts.cancel')}
          confirmLabel={t('admin.paymentAccounts.delete')}
          busyLabel={t('admin.paymentAccounts.saving')}
        />
      ) : null}
    </section>
  )
}
