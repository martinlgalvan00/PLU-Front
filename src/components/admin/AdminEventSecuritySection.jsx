import { useEffect, useRef, useState } from 'react'
import {
  ExternalLink,
  ListChecks,
  QrCode,
  ScanLine,
  Send,
  Shield,
  ShieldOff,
  UserPlus,
} from 'lucide-react'
import Pill from '../ui/Pill.jsx'
import { AdminIdentityCell } from './AdminTableCells.jsx'
import AdminApiConnectionNotice from './AdminApiConnectionNotice.jsx'
import SecurityCredentialModal from './SecurityCredentialModal.jsx'
import SecurityTeamBuilder from './SecurityTeamBuilder.jsx'
import SecurityTeamDelivery from './SecurityTeamDelivery.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import {
  SECURITY_TEAM_MAX,
  createSecurityTeamMember,
  parseSecurityTeamImport,
  validateSecurityTeamMembers,
} from '../../services/securityTeamService.js'

/**
 * Equipo seguridad_plu_arg del evento. El alta individual y masiva comparten
 * un único flujo: cargar personas, crear cuentas y entregar links personales.
 */
export default function AdminEventSecuritySection({
  canManageUsers,
  eventId,
  eventSlug,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onUpdateSecurityUserStatus,
}) {
  const { t } = useI18n()
  const memberIdRef = useRef(1)
  const [users, setUsers] = useState([])
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

  const gatePath = eventSlug ? buildSecurityGatePath(eventSlug) : ''
  const gateUrl = gatePath && typeof window !== 'undefined' ? `${window.location.origin}${gatePath}` : gatePath
  const activeCount = users.filter((user) => user.status === 'active').length

  function nextMember(values = {}) {
    memberIdRef.current += 1
    return createSecurityTeamMember(`security-member-${memberIdRef.current}`, values)
  }

  useEffect(() => {
    let active = true
    if (!eventId) return undefined

    setLoading(true)
    setLoadError(null)
    onListSecurityUsers(eventId)
      .then((rows) => {
        if (active) setUsers(rows)
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
  }, [eventId, onListSecurityUsers, reloadKey])

  function handleMemberChange(id, field, value) {
    setMembers((current) => current.map((member) => (member.id === id ? { ...member, [field]: value } : member)))
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
    setMembers((current) => current.length === 1 ? current : current.filter((member) => member.id !== id))
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
      return { ok: false, message: t('admin.eventEditor.security.importLimit', { max: SECURITY_TEAM_MAX }) }
    }

    const imported = parsed.members.map((member) => nextMember(member))
    setMembers((current) => currentHasContent ? [...current, ...imported] : imported)
    setMemberErrors({})
    return { ok: true }
  }

  async function createPersonalAccess(created) {
    if (!onCreateSecurityAccessLink || created.every((item) => item.accessUrl)) return created

    const settled = await Promise.allSettled(
      created.map((item) => item.accessUrl
        ? Promise.resolve({
            url: item.accessUrl,
            expiresAt: item.expiresAt,
            emailed: item.emailed,
          })
        : onCreateSecurityAccessLink(item.user.id, sendEmail)),
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
    } catch {
      setOperationError(t('admin.eventEditor.security.errorStatus'))
    } finally {
      setPendingStatusId(null)
    }
  }

  async function handleDeactivateAll() {
    setDeactivatingAll(true)
    setOperationError('')
    try {
      await onDeactivateAllSecurityUsers(eventId)
      setUsers((current) => current.map((user) => ({ ...user, status: 'disabled' })))
      setConfirmingDeactivateAll(false)
    } catch {
      setOperationError(t('admin.eventEditor.security.errorStatus'))
    } finally {
      setDeactivatingAll(false)
    }
  }

  return (
    <fieldset className="admin-event-form__pricing admin-event-security">
      <legend>
        <Shield size={14} aria-hidden />
        {t('admin.eventEditor.security.title')}
      </legend>
      <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.security.lead')}</p>

      <ol className="admin-event-security__flow" aria-label={t('admin.eventEditor.security.flowLabel')}>
        <li className={activeCount > 0 ? 'is-complete' : 'is-current'}>
          <UserPlus size={14} aria-hidden />
          <span><strong>{activeCount > 0 ? '✓' : '1'}</strong>{t('admin.eventEditor.security.flowCreate')}</span>
        </li>
        <li className={teamResult?.created.length ? 'is-complete' : activeCount > 0 ? 'is-current' : ''}>
          <Send size={14} aria-hidden />
          <span><strong>{teamResult?.created.length ? '✓' : '2'}</strong>{t('admin.eventEditor.security.flowShare')}</span>
        </li>
        <li>
          <ScanLine size={14} aria-hidden />
          <span><strong>3</strong>{t('admin.eventEditor.security.flowOperate')}</span>
        </li>
      </ol>

      {gateUrl && (
        <div className="admin-event-security__command">
          <div className="admin-event-security__command-copy">
            <span className="admin-event-security__command-icon" aria-hidden><ScanLine size={17} /></span>
            <div>
              <strong>{t('admin.eventEditor.security.commandTitle')}</strong>
              <span>{t('admin.eventEditor.security.commandLead')}</span>
            </div>
          </div>
          <div className="admin-event-security__command-actions">
            <a className="admin-event-security__launch" href={gateUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden />
              {t('admin.eventEditor.security.previewControl')}
            </a>
          </div>
        </div>
      )}

      {loadError && (
        <AdminApiConnectionNotice
          error={loadError}
          retrying={loading}
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      )}

      {canManageUsers && !loadError && (
        teamResult ? (
          <SecurityTeamDelivery
            result={teamResult}
            onOpenCredential={setCredentialUser}
            onClose={() => setTeamResult(null)}
          />
        ) : (
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
        )
      )}

      {teamSubmitError && (
        teamSubmitError.status === 0 ? (
          <AdminApiConnectionNotice
            error={teamSubmitError}
            retrying={teamSubmitting}
            onRetry={handleCreateTeam}
          />
        ) : (
          <p className="admin-users__form-error" role="alert">
            {teamSubmitError.status === 409
              ? t('admin.users.errorEmailTaken')
              : teamSubmitError.body?.error ?? t('admin.users.errorCreate')}
          </p>
        )
      )}

      {operationError && <p className="admin-users__form-error" role="alert">{operationError}</p>}

      {loading ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.loading')}</p>
      ) : !loadError && users.length === 0 ? (
        <div className="admin-event-security__empty admin-event-security__empty--team">
          <UserPlus size={18} aria-hidden />
          <strong>{t('admin.eventEditor.security.emptyTitle')}</strong>
          <span>{t('admin.eventEditor.security.empty')}</span>
        </div>
      ) : !loadError ? (
        <>
          <div className="admin-event-security__roster-head">
            <span><ListChecks size={13} aria-hidden />{t('admin.eventEditor.security.rosterTitle')}</span>
            <small>{t('admin.eventEditor.security.activeCount', { active: activeCount, total: users.length })}</small>
          </div>
          {canManageUsers && activeCount > 0 && (
            <div className="admin-event-security__list-actions">
              {confirmingDeactivateAll ? (
                <>
                  <span className="admin-event-security__confirm-copy">
                    {t('admin.eventEditor.security.deactivateAllConfirm', { count: activeCount })}
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
                    className="admin-event-security__toggle admin-event-security__toggle--celeste"
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

          <ul className="admin-event-security__list">
            {users.map((user) => {
              const active = user.status === 'active'
              return (
                <li key={user.id} className="admin-event-security__item">
                  <AdminIdentityCell accent={active ? 'celeste' : 'gold'} name={user.name} sub={user.email} />
                  <Pill tone={active ? 'success' : 'neutral'}>
                    {active
                      ? t('admin.eventEditor.security.statusActive')
                      : t('admin.eventEditor.security.statusDisabled')}
                  </Pill>
                  {canManageUsers && (
                    <div className="admin-event-security__item-actions">
                      {active && onCreateSecurityAccessLink && (
                        <button
                          type="button"
                          className="admin-event-security__toggle admin-event-security__toggle--celeste"
                          onClick={() => setCredentialUser(user)}
                        >
                          <QrCode size={13} aria-hidden />
                          {t('admin.eventEditor.security.credential')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`admin-event-security__toggle${active ? ' admin-event-security__toggle--danger' : ' admin-event-security__toggle--celeste'}`}
                        disabled={pendingStatusId === user.id}
                        onClick={() => handleToggleStatus(user)}
                      >
                        {active ? <ShieldOff size={13} aria-hidden /> : <Shield size={13} aria-hidden />}
                        {active
                          ? t('admin.eventEditor.security.deactivate')
                          : t('admin.eventEditor.security.activate')}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {credentialUser && (
        <SecurityCredentialModal
          user={credentialUser}
          onGenerate={(shouldSendEmail) => onCreateSecurityAccessLink(credentialUser.id, shouldSendEmail)}
          onClose={() => setCredentialUser(null)}
        />
      )}
    </fieldset>
  )
}
