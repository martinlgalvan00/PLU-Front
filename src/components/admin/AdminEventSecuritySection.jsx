import { useEffect, useRef, useState } from 'react'
import { Plus, QrCode, Shield, ShieldOff, UserPlus } from 'lucide-react'
import Pill from '../ui/Pill.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import { AdminIdentityCell } from './AdminTableCells.jsx'
import AdminApiConnectionNotice from './AdminApiConnectionNotice.jsx'
import SecurityCredentialModal from './SecurityCredentialModal.jsx'
import SecurityTeamBuilder from './SecurityTeamBuilder.jsx'
import SecurityTeamDelivery from './SecurityTeamDelivery.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  SECURITY_TEAM_MAX,
  createSecurityTeamMember,
  parseSecurityTeamImport,
  validateSecurityTeamMembers,
} from '../../services/securityTeamService.js'
import '../../styles/pages/admin-event-security.css'

/**
 * Equipo seguridad_plu_arg del evento. El alta individual y masiva comparten
 * un único flujo: cargar personas, crear cuentas y entregar links personales.
 */
export default function AdminEventSecuritySection({
  canManageUsers,
  eventId,
  eventEndsAt,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onAssignMember,
  onListSecurityUsers,
  onListZones,
  // Avisa hacia arriba que el equipo cambió. Las zonas viven en otro componente
  // y leen las mismas cuentas: sin esto, una cuenta recién creada no aparecía
  // como pendiente de asignar hasta recargar la sección.
  onTeamChange,
  onUpdateSecurityUserStatus,
  reloadToken = 0,
}) {
  const { t } = useI18n()
  const memberIdRef = useRef(1)
  const [users, setUsers] = useState([])
  const [zones, setZones] = useState([])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [assigningId, setAssigningId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [members, setMembers] = useState(() => [createSecurityTeamMember('security-member-1')])
  const [memberErrors, setMemberErrors] = useState({})
  const [sendEmail, setSendEmail] = useState(true)
  const [teamSubmitting, setTeamSubmitting] = useState(false)
  const [teamSubmitError, setTeamSubmitError] = useState(null)
  const [teamResult, setTeamResult] = useState(null)

  const [operationError, setOperationError] = useState('')
  const [pendingStatusId, setPendingStatusId] = useState(null)
  const [confirmingDeactivateAll, setConfirmingDeactivateAll] = useState(false)
  const [deactivatingAll, setDeactivatingAll] = useState(false)
  const [credentialUser, setCredentialUser] = useState(null)

  const activeCount = users.filter((user) => user.status === 'active').length
  const eventEnded = Boolean(eventEndsAt) && new Date(eventEndsAt).getTime() < Date.now()

  function nextMember(values = {}) {
    memberIdRef.current += 1
    return createSecurityTeamMember(`security-member-${memberIdRef.current}`, values)
  }

  useEffect(() => {
    let active = true
    if (!eventId) return undefined

    setLoading(true)
    setLoadError(null)
    // Las zonas se leen para ofrecer el reparto en cada fila del equipo; si no
    // cargan, el listado sigue siendo útil (muestra la zona, no la edita).
    Promise.all([
      onListSecurityUsers(eventId),
      onListZones ? onListZones(eventId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([rows, zoneRows]) => {
        if (!active) return
        setUsers(rows)
        setZones(Array.isArray(zoneRows) ? zoneRows : [])
      })
      .catch((error) => {
        if (active) setLoadError(error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventId, onListSecurityUsers, onListZones, reloadKey, reloadToken])

  function handleMemberChange(id, field, value) {
    setMembers((current) =>
      current.map((member) => (member.id === id ? { ...member, [field]: value } : member)),
    )
    setMemberErrors((current) => {
      if (!current[id]?.[field]) return current
      const nextRow = { ...current[id] }
      delete nextRow[field]
      const next = { ...current }
      if (Object.keys(nextRow).length) next[id] = nextRow
      else delete next[id]
      return next
    })
  }

  function handleAddMember() {
    if (members.length >= SECURITY_TEAM_MAX) return
    setMembers((current) => [...current, nextMember()])
  }

  function handleRemoveMember(id) {
    setMembers((current) =>
      current.length === 1 ? current : current.filter((member) => member.id !== id),
    )
    setMemberErrors((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  function handleImportMembers(raw) {
    const parsed = parseSecurityTeamImport(raw)
    if (parsed.invalid.length) {
      return {
        ok: false,
        message: t('admin.eventEditor.security.importInvalid', {
          lines: parsed.invalid.map((item) => item.line).join(', '),
        }),
      }
    }
    if (!parsed.members.length) {
      return { ok: false, message: t('admin.eventEditor.security.bulkEmpty') }
    }

    const currentHasContent = members.some((member) => member.name.trim() || member.email.trim())
    const available = SECURITY_TEAM_MAX - (currentHasContent ? members.length : 0)
    if (parsed.members.length > available) {
      return {
        ok: false,
        message: t('admin.eventEditor.security.importLimit', { max: SECURITY_TEAM_MAX }),
      }
    }

    const imported = parsed.members.map((member) => nextMember(member))
    setMembers((current) => (currentHasContent ? [...current, ...imported] : imported))
    setMemberErrors({})
    return { ok: true }
  }

  async function createPersonalAccess(created) {
    if (!onCreateSecurityAccessLink || created.every((item) => item.accessUrl)) return created

    const settled = await Promise.allSettled(
      created.map((item) =>
        item.accessUrl
          ? Promise.resolve({
              url: item.accessUrl,
              expiresAt: item.expiresAt,
              emailed: item.emailed,
            })
          : onCreateSecurityAccessLink(item.user.id, { sendEmail }),
      ),
    )

    return created.map((item, index) => {
      const credential = settled[index]
      if (credential.status !== 'fulfilled') return { ...item, accessError: true }
      return {
        ...item,
        accessUrl: credential.value.url,
        expiresAt: credential.value.expiresAt,
        emailed: credential.value.emailed,
      }
    })
  }

  async function handleCreateTeam() {
    const validation = validateSecurityTeamMembers(members)
    setMemberErrors(validation.errors)
    if (!validation.isValid) return

    setTeamSubmitting(true)
    setTeamSubmitError(null)
    setTeamResult(null)

    try {
      let result
      if (validation.members.length === 1) {
        const created = await onCreateSecurityUser({
          ...validation.members[0],
          eventId,
          sendEmail,
        })
        result = { created: [created], skipped: [] }
      } else {
        result = await onCreateSecurityUsersBulk({
          eventId,
          users: validation.members,
          sendEmail,
        })
      }

      const createdWithAccess = await createPersonalAccess(result.created)
      const createdUsers = createdWithAccess.map((item) => item.user)
      setUsers((current) => [
        ...createdUsers,
        ...current.filter((user) => !createdUsers.some((created) => created.id === user.id)),
      ])
      setTeamResult({ created: createdWithAccess, skipped: result.skipped })
      setMembers([nextMember()])
      setMemberErrors({})
      setBuilderOpen(false)
      onTeamChange?.()
    } catch (error) {
      setTeamSubmitError(error)
    } finally {
      setTeamSubmitting(false)
    }
  }

  async function handleToggleStatus(user) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setPendingStatusId(user.id)
    setOperationError('')
    try {
      const updated = await onUpdateSecurityUserStatus(user.id, nextStatus)
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      onTeamChange?.()
    } catch {
      setOperationError(t('admin.eventEditor.security.errorStatus'))
    } finally {
      setPendingStatusId(null)
    }
  }

  async function handleAssignZone(user, zoneId) {
    if (!onAssignMember) return
    const nextZoneId = zoneId || null
    setAssigningId(user.id)
    setOperationError('')
    try {
      await onAssignMember(user.id, nextZoneId)
      const zone = zones.find((item) => item.id === nextZoneId) ?? null
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                securityZoneId: nextZoneId,
                securityZone: zone ? { id: zone.id, name: zone.name } : null,
              }
            : item,
        ),
      )
      onTeamChange?.()
    } catch {
      setOperationError(t('admin.eventZones.saveError'))
    } finally {
      setAssigningId(null)
    }
  }

  async function handleDeactivateAll() {
    setDeactivatingAll(true)
    setOperationError('')
    try {
      await onDeactivateAllSecurityUsers(eventId)
      setUsers((current) => current.map((user) => ({ ...user, status: 'disabled' })))
      setConfirmingDeactivateAll(false)
      onTeamChange?.()
    } catch {
      setOperationError(t('admin.eventEditor.security.errorStatus'))
    } finally {
      setDeactivatingAll(false)
    }
  }

  const canAddPeople = canManageUsers && !loadError && !teamResult
  // Sin equipo todavía el alta ES el estado vacío: se muestra abierta. Con
  // equipo cargado el listado va primero y el alta se despliega a pedido.
  const builderVisible = canAddPeople && (builderOpen || (!loading && users.length === 0))
  const hasRoster = !loading && !loadError && users.length > 0

  return (
    <section className="admin-event-security" aria-labelledby="admin-event-security-title">
      <header className="admin-event-security__head">
        <div className="admin-event-security__head-copy">
          <h3 id="admin-event-security-title">{t('admin.eventEditor.security.title')}</h3>
          <p className="admin-event-security__lead">{t('admin.eventEditor.security.lead')}</p>
        </div>
        {canAddPeople && hasRoster ? (
          <button
            type="button"
            className="admin-event-security__toggle"
            aria-expanded={builderOpen}
            onClick={() => setBuilderOpen((open) => !open)}
          >
            {builderOpen ? null : <Plus size={14} aria-hidden />}
            {builderOpen ? t('common.close') : t('admin.eventEditor.security.addPeople')}
          </button>
        ) : null}
      </header>

      {eventEnded && (
        <p className="admin-event-security__lifecycle-note" role="note">
          <ShieldOff size={13} aria-hidden />
          {t('admin.eventEditor.security.eventEndedNote')}
        </p>
      )}

      {loadError && (
        <AdminApiConnectionNotice
          error={loadError}
          retrying={loading}
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      )}

      {canManageUsers && !loadError && teamResult ? (
        <SecurityTeamDelivery
          result={teamResult}
          onOpenCredential={setCredentialUser}
          onClose={() => setTeamResult(null)}
        />
      ) : null}

      {builderVisible ? (
        <SecurityTeamBuilder
          members={members}
          errors={memberErrors}
          sendEmail={sendEmail}
          submitting={teamSubmitting}
          onAdd={handleAddMember}
          onChange={handleMemberChange}
          onImport={handleImportMembers}
          onRemove={handleRemoveMember}
          onSendEmailChange={setSendEmail}
          onSubmit={handleCreateTeam}
        />
      ) : null}

      {teamSubmitError &&
        (teamSubmitError.status === 0 ? (
          <AdminApiConnectionNotice
            error={teamSubmitError}
            retrying={teamSubmitting}
            onRetry={handleCreateTeam}
          />
        ) : (
          <p className="admin-users__form-error" role="alert">
            {teamSubmitError.status === 409
              ? t('admin.users.errorEmailTaken')
              : (teamSubmitError.body?.error ?? t('admin.users.errorCreate'))}
          </p>
        ))}

      {operationError && (
        <p className="admin-users__form-error" role="alert">
          {operationError}
        </p>
      )}

      {loading ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.loading')}</p>
      ) : !loadError && users.length === 0 && !builderVisible ? (
        <div className="admin-event-security__empty admin-event-security__empty--team">
          <UserPlus size={18} aria-hidden />
          <strong>{t('admin.eventEditor.security.emptyTitle')}</strong>
          <span>{t('admin.eventEditor.security.empty')}</span>
        </div>
      ) : hasRoster ? (
        <div className="admin-event-security__roster">
          <div className="admin-event-security__roster-head">
            <span>{t('admin.eventEditor.security.rosterTitle')}</span>
            <small>
              {t('admin.eventEditor.security.activeCount', {
                active: activeCount,
                total: users.length,
              })}
            </small>
            {canManageUsers && activeCount > 0 && (
              <div className="admin-event-security__list-actions">
                {confirmingDeactivateAll ? (
                  <>
                    <span className="admin-event-security__confirm-copy">
                      {t('admin.eventEditor.security.deactivateAllConfirm', {
                        count: activeCount,
                      })}
                    </span>
                    <button
                      type="button"
                      className="admin-event-security__toggle admin-event-security__toggle--danger"
                      disabled={deactivatingAll}
                      onClick={handleDeactivateAll}
                    >
                      <ShieldOff size={13} aria-hidden />
                      {t('admin.eventEditor.security.deactivateAllYes')}
                    </button>
                    <button
                      type="button"
                      className="admin-event-security__toggle"
                      disabled={deactivatingAll}
                      onClick={() => setConfirmingDeactivateAll(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="admin-event-security__toggle admin-event-security__toggle--danger"
                    onClick={() => setConfirmingDeactivateAll(true)}
                  >
                    <ShieldOff size={13} aria-hidden />
                    {t('admin.eventEditor.security.deactivateAll')}
                  </button>
                )}
              </div>
            )}
          </div>

          <ul className="admin-event-security__list">
            {users.map((user) => {
              const active = user.status === 'active'
              const canAssign = canManageUsers && onAssignMember && zones.length > 0
              return (
                <li key={user.id} className="admin-event-security__item">
                  <AdminIdentityCell
                    accent={active ? 'celeste' : 'gold'}
                    name={user.name}
                    sub={user.email}
                  />
                  {canAssign ? (
                    <select
                      className={`admin-event-security__zone-select${
                        user.securityZoneId ? '' : ' is-unassigned'
                      }`}
                      value={user.securityZoneId ?? ''}
                      disabled={assigningId === user.id}
                      aria-label={t('admin.eventZones.assignMember', { name: user.name })}
                      onChange={(event) => void handleAssignZone(user, event.target.value)}
                    >
                      <option value="">{t('admin.eventEditor.security.rosterNoZone')}</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="admin-event-security__zone">
                      {user.securityZone?.name || t('admin.eventEditor.security.rosterNoZone')}
                    </span>
                  )}
                  <Pill tone={active ? 'success' : 'neutral'}>
                    {active
                      ? t('admin.eventEditor.security.statusActive')
                      : t('admin.eventEditor.security.statusDisabled')}
                  </Pill>
                  {canManageUsers && (
                    <div className="admin-event-security__item-actions">
                      {active && onCreateSecurityAccessLink && (
                        <AdminIconButton
                          icon={QrCode}
                          label={t('admin.eventEditor.security.credentialFor', { name: user.name })}
                          onClick={() => setCredentialUser(user)}
                        />
                      )}
                      <AdminIconButton
                        icon={active ? ShieldOff : Shield}
                        label={t(
                          active
                            ? 'admin.eventEditor.security.deactivateFor'
                            : 'admin.eventEditor.security.activateFor',
                          { name: user.name },
                        )}
                        disabled={pendingStatusId === user.id}
                        onClick={() => handleToggleStatus(user)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {credentialUser && (
        <SecurityCredentialModal
          user={credentialUser}
          onGenerate={(options) => onCreateSecurityAccessLink(credentialUser.id, options)}
          onClose={() => setCredentialUser(null)}
        />
      )}
    </section>
  )
}
