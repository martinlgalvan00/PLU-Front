import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import AdminIconButton from './AdminIconButton.jsx'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  ZONE_MEMBERS_MAX,
  buildZonePayload,
  buildZoneTeamSummary,
  createZoneForm,
  formatZoneShift,
  getMemberInitials,
  getZoneScopeOptions,
  groupSecurityTeamByZone,
  validateZoneForm,
} from '../../services/securityZoneService.js'

/**
 * AdminEventZonesSection — PLU ARG
 *
 * Zonas físicas del meet y el reparto del equipo de seguridad entre ellas.
 *
 * Antes el equipo era una lista plana de cuentas colgadas del evento: el link
 * de quien controlaba la puerta servía igual para leer credenciales en el
 * pesaje, y no había forma de saber quién cubría qué ni en qué horario. Una
 * zona junta las tres cosas que faltaban -- lugar, alcance de escaneo y turno
 * -- y el reparto pasa a ser explícito.
 *
 * Las cuentas se siguen creando abajo, en el equipo del evento: acá se asignan.
 * Separar alta de asignación es a propósito -- crear una cuenta manda un mail y
 * es irreversible en la práctica, mover a alguien de zona no.
 */
export default function AdminEventZonesSection({
  canManageUsers = false,
  eventId,
  eventSlug,
  onAssignMember,
  onCreateAccessLink,
  onCreateZone,
  onDeleteZone,
  onListSecurityUsers,
  onListZones,
  onPresetZones,
  onUpdateZone,
  reloadToken = 0,
}) {
  const { locale, t } = useI18n()
  const [zones, setZones] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => createZoneForm())
  const [formErrors, setFormErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const scopeOptions = useMemo(() => getZoneScopeOptions(t), [t])

  const reload = useCallback(() => setReloadKey((current) => current + 1), [])

  useEffect(() => {
    if (!eventId) return undefined
    let active = true

    setLoading(true)
    setLoadError(null)
    Promise.all([onListZones(eventId), onListSecurityUsers(eventId)])
      .then(([zoneRows, userRows]) => {
        if (!active) return
        setZones(zoneRows)
        setUsers(userRows)
      })
      .catch((error) => {
        if (active) setLoadError(error?.message ?? t('admin.eventZones.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventId, onListSecurityUsers, onListZones, reloadKey, reloadToken, t])

  const grouped = useMemo(() => groupSecurityTeamByZone(zones, users), [users, zones])
  const summary = useMemo(() => buildZoneTeamSummary(grouped), [grouped])

  async function run(action, successKey) {
    if (!canManageUsers || busy) return false
    setBusy(true)
    setNotice(null)
    try {
      const nextZones = await action()
      if (Array.isArray(nextZones)) setZones(nextZones)
      // Asignar cambia `securityZoneId` de la cuenta, que vive del lado de los
      // usuarios: sin recargarlos la fila volvería a su zona anterior.
      const refreshed = await onListSecurityUsers(eventId)
      setUsers(refreshed)
      if (successKey) setNotice({ tone: 'success', text: t(successKey) })
      return true
    } catch (error) {
      setNotice({ tone: 'error', text: error?.message ?? t('admin.eventZones.saveError') })
      return false
    } finally {
      setBusy(false)
    }
  }

  function openCreateForm() {
    setEditingId(null)
    setForm(createZoneForm())
    setFormErrors({})
    setFormOpen(true)
  }

  function openEditForm(zone) {
    setEditingId(zone.id)
    setForm(createZoneForm(zone))
    setFormErrors({})
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormErrors({})
  }

  async function handleSubmitZone(event) {
    event.preventDefault()
    const validation = validateZoneForm(form)
    setFormErrors(validation.errors)
    if (!validation.isValid) return

    const payload = buildZonePayload(form)
    const ok = await run(
      () =>
        editingId
          ? onUpdateZone(editingId, payload)
          : onCreateZone({ ...payload, eventId, eventSlug }),
      editingId ? 'admin.eventZones.updated' : 'admin.eventZones.created',
    )
    if (ok) closeForm()
  }

  function handleDeleteZone(zone) {
    void run(() => onDeleteZone(zone.id), 'admin.eventZones.deleted')
  }

  function handleAssign(userId, zoneId) {
    void run(() => onAssignMember(userId, zoneId), 'admin.eventZones.assigned')
  }

  /**
   * Emite un acceso nuevo para cada integrante de la zona. Cada emisión anula
   * el link anterior de esa persona, así que se avisa en el copy y no se ofrece
   * como acción de rutina.
   */
  async function handleSendZoneAccess(zone) {
    if (!onCreateAccessLink || !zone.members.length) return
    await run(async () => {
      await Promise.all(zone.members.map((member) => onCreateAccessLink(member.id, true)))
      return null
    }, 'admin.eventZones.accessSent')
  }

  const scopeLabel = (scope) => t(`admin.eventZones.scope.${scope}`)

  if (loading) {
    return (
      <div className="admin-event-zones__loading" role="status">
        <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
        <p>{t('admin.eventZones.loading')}</p>
      </div>
    )
  }

  return (
    <section className="admin-event-zones" aria-labelledby="admin-event-zones-title">
      <header className="admin-event-zones__head">
        <div className="admin-event-zones__head-copy">
          <span className="admin-event-zones__eyebrow">{t('admin.eventZones.eyebrow')}</span>
          <h3 id="admin-event-zones-title">{t('admin.eventZones.title')}</h3>
          <p>{t('admin.eventZones.lead')}</p>
        </div>
        <AdminIconButton
          className={loading ? 'is-spinning' : undefined}
          disabled={busy}
          icon={RefreshCw}
          label={t('admin.eventZones.refresh')}
          onClick={reload}
          variant="ghost"
        />
      </header>

      {loadError ? (
        <p className="admin-event-zones__notice admin-event-zones__notice--error" role="alert">
          <AlertTriangle size={14} aria-hidden />
          {loadError}
        </p>
      ) : null}

      <div className="admin-event-zones__tools">
        {canManageUsers ? (
          <>
            <button type="button" onClick={openCreateForm} disabled={busy}>
              <Plus size={14} aria-hidden />
              {t('admin.eventZones.addZone')}
            </button>
            {zones.length === 0 && onPresetZones ? (
              <button
                type="button"
                onClick={() =>
                  void run(() => onPresetZones({ eventId, eventSlug }), 'admin.eventZones.presetDone')
                }
                disabled={busy}
              >
                <Layers size={14} aria-hidden />
                {t('admin.eventZones.preset')}
              </button>
            ) : null}
          </>
        ) : null}
        <span className="admin-event-zones__summary">
          {t('admin.eventZones.summary', {
            zones: summary.zoneCount,
            members: summary.memberCount,
            active: summary.activeCount,
          })}
        </span>
      </div>

      {formOpen ? (
        <form className="admin-event-zones__form" onSubmit={handleSubmitZone}>
          <label>
            <span>{t('admin.eventZones.fieldName')}</span>
            <input
              name="zone-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('admin.eventZones.fieldNamePlaceholder')}
              aria-invalid={Boolean(formErrors.name)}
              autoComplete="off"
            />
            {formErrors.name ? (
              <small role="alert">{t(`admin.eventZones.validation.${formErrors.name}`)}</small>
            ) : null}
          </label>
          <label>
            <span>{t('admin.eventZones.fieldScope')}</span>
            <select
              value={form.scope}
              onChange={(event) => setForm({ ...form, scope: event.target.value })}
            >
              {scopeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <small>{t(`admin.eventZones.scopeHint.${form.scope}`)}</small>
          </label>
          <label>
            <span>{t('admin.eventZones.fieldShiftStart')}</span>
            <input
              type="datetime-local"
              value={form.shiftStart}
              onChange={(event) => setForm({ ...form, shiftStart: event.target.value })}
            />
          </label>
          <label>
            <span>{t('admin.eventZones.fieldShiftEnd')}</span>
            <input
              type="datetime-local"
              value={form.shiftEnd}
              onChange={(event) => setForm({ ...form, shiftEnd: event.target.value })}
              aria-invalid={Boolean(formErrors.shiftEnd)}
            />
            {formErrors.shiftEnd ? (
              <small role="alert">{t(`admin.eventZones.validation.${formErrors.shiftEnd}`)}</small>
            ) : null}
          </label>
          <div className="admin-event-zones__form-actions">
            <button type="button" onClick={closeForm} disabled={busy}>
              {t('common.cancel')}
            </button>
            <Button type="submit" variant="gold" className="btn--small" disabled={busy}>
              {editingId ? t('common.save') : t('admin.eventZones.createZone')}
            </Button>
          </div>
        </form>
      ) : null}

      {zones.length === 0 ? (
        <p className="admin-event-zones__empty">{t('admin.eventZones.empty')}</p>
      ) : (
        <ul className="admin-event-zones__list">
          {grouped.zones.map((zone) => {
            const expanded = expandedId === zone.id
            const pending = zone.members.length - zone.activeCount
            const full = zone.members.length >= ZONE_MEMBERS_MAX

            return (
              <li
                className={`admin-event-zones__zone${expanded ? ' is-expanded' : ''}`}
                key={zone.id}
              >
                <button
                  type="button"
                  className="admin-event-zones__zone-row"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : zone.id)}
                >
                  <span className="admin-event-zones__zone-identity">
                    <strong>{zone.name}</strong>
                    <small>{scopeLabel(zone.scope)}</small>
                  </span>
                  <span className="admin-event-zones__zone-shift">
                    {formatZoneShift(zone, locale, t)}
                  </span>
                  <span className="admin-event-zones__zone-members">
                    {zone.members.slice(0, 4).map((member) => (
                      <span
                        className="admin-event-zones__avatar"
                        key={member.id}
                        title={`${member.name} · ${member.email}`}
                      >
                        {getMemberInitials(member.name, member.email)}
                      </span>
                    ))}
                    {zone.members.length > 4 ? (
                      <span className="admin-event-zones__avatar admin-event-zones__avatar--more">
                        +{zone.members.length - 4}
                      </span>
                    ) : null}
                    {zone.members.length === 0 ? (
                      <small className="admin-event-zones__zone-empty">
                        {t('admin.eventZones.zoneEmpty')}
                      </small>
                    ) : null}
                  </span>
                  <span
                    className={`admin-event-zones__tag${pending > 0 ? ' admin-event-zones__tag--wait' : zone.activeCount > 0 ? ' admin-event-zones__tag--ok' : ''}`}
                  >
                    {pending > 0
                      ? t('admin.eventZones.accessPending', { count: pending })
                      : t('admin.eventZones.accessActive', { count: zone.activeCount })}
                  </span>
                  {expanded ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                </button>

                {expanded ? (
                  <div className="admin-event-zones__zone-detail">
                    <p className="admin-event-zones__scope-hint">
                      {t(`admin.eventZones.scopeHint.${zone.scope}`)}
                    </p>

                    {zone.members.length > 0 ? (
                      <ul className="admin-event-zones__members">
                        {zone.members.map((member) => (
                          <li key={member.id}>
                            <span className="admin-event-zones__avatar">
                              {getMemberInitials(member.name, member.email)}
                            </span>
                            <strong>{member.name}</strong>
                            <code>{member.email}</code>
                            <span
                              className={`admin-event-zones__tag${member.status === 'active' ? ' admin-event-zones__tag--ok' : ' admin-event-zones__tag--wait'}`}
                            >
                              {t(`admin.eventZones.memberStatus.${member.status}`)}
                            </span>
                            {canManageUsers ? (
                              <button
                                type="button"
                                className="admin-event-zones__member-remove"
                                onClick={() => handleAssign(member.id, null)}
                                disabled={busy}
                                aria-label={t('admin.eventZones.unassignMember', {
                                  name: member.name,
                                })}
                              >
                                <UserMinus size={15} aria-hidden />
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="admin-event-zones__zone-detail-empty">
                        {t('admin.eventZones.zoneEmptyDetail')}
                      </p>
                    )}

                    {canManageUsers ? (
                      <div className="admin-event-zones__zone-actions">
                        {grouped.unassigned.length > 0 && !full ? (
                          <label className="admin-event-zones__assign">
                            <span>{t('admin.eventZones.assignLabel')}</span>
                            <select
                              value=""
                              disabled={busy}
                              onChange={(event) => {
                                if (event.target.value) handleAssign(event.target.value, zone.id)
                              }}
                            >
                              <option value="">{t('admin.eventZones.assignPlaceholder')}</option>
                              {grouped.unassigned.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name} · {member.email}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {full ? (
                          <p className="admin-event-zones__zone-detail-empty">
                            {t('admin.eventZones.zoneFull', { max: ZONE_MEMBERS_MAX })}
                          </p>
                        ) : null}

                        {onCreateAccessLink && zone.members.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => void handleSendZoneAccess(zone)}
                            disabled={busy}
                          >
                            <Send size={14} aria-hidden />
                            {t('admin.eventZones.sendAccess', { count: zone.members.length })}
                          </button>
                        ) : null}

                        <button type="button" onClick={() => openEditForm(zone)} disabled={busy}>
                          {t('admin.eventZones.editZone')}
                        </button>
                        <button
                          type="button"
                          className="admin-event-zones__zone-delete"
                          onClick={() => handleDeleteZone(zone)}
                          disabled={busy}
                        >
                          <Trash2 size={14} aria-hidden />
                          {t('admin.eventZones.deleteZone')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {/* Cuentas creadas sin puesto. No se esconden: es lo que hay que resolver
          antes del meet, y en una lista plana no se notaba. */}
      {grouped.unassigned.length > 0 ? (
        <div className="admin-event-zones__unassigned">
          <span className="admin-event-zones__unassigned-label">
            <UserPlus size={14} aria-hidden />
            {t('admin.eventZones.unassignedLabel', { count: grouped.unassigned.length })}
          </span>
          <ul>
            {grouped.unassigned.map((member) => (
              <li key={member.id}>
                <span className="admin-event-zones__avatar">
                  {getMemberInitials(member.name, member.email)}
                </span>
                <strong>{member.name}</strong>
                <code>{member.email}</code>
                {canManageUsers && zones.length > 0 ? (
                  <select
                    value=""
                    disabled={busy}
                    onChange={(event) => {
                      if (event.target.value) handleAssign(member.id, event.target.value)
                    }}
                    aria-label={t('admin.eventZones.assignMember', { name: member.name })}
                  >
                    <option value="">{t('admin.eventZones.assignPlaceholder')}</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? (
        <p
          className={`admin-event-zones__notice admin-event-zones__notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  )
}
