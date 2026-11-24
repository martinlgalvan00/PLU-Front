import { useId, useMemo, useState } from 'react'
import { ShieldCheck, UserCog } from 'lucide-react'
import Button from '../ui/Button.jsx'
import StaffInvitationNotice from './StaffInvitationNotice.jsx'
import { getRoleLabel } from '../../lib/roles.js'
import {
  findStaffAccount,
  listAssignableStaffRoles,
  normalizeEmail,
} from '../../services/staffAccessService.js'

const DEFAULT_ROLE = 'plu_arg'

const STATUS_KEYS = {
  active: 'admin.users.statusActive',
  invited: 'admin.users.statusInvited',
  suspended: 'admin.users.statusSuspended',
  disabled: 'admin.users.statusDisabled',
}

// Bloque de la ficha del atleta para darle entrada al panel. La cuenta de
// atleta no se toca: se crea una cuenta del panel con el mismo email y la
// persona activa su contraseña desde un enlace. Entra por /login con ese email
// y, si hace falta, vuelve a su perfil de atleta desde el puente existente.
export default function AthletePanelAccess({
  accessRoles,
  athlete,
  locale,
  onCreateUser,
  onOpenUsers,
  t,
  users,
}) {
  const selectId = useId()
  const email = normalizeEmail(athlete?.email)
  const account = useMemo(() => findStaffAccount(users, email), [users, email])
  // Seguridad es nominal y atada a un evento: no sale de una ficha de atleta.
  const roles = useMemo(
    () => listAssignableStaffRoles(accessRoles).filter((role) => role.key !== 'seguridad_plu_arg'),
    [accessRoles],
  )
  const [roleKey, setRoleKey] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [granted, setGranted] = useState(null)

  const selectedKey =
    roles.find((role) => role.key === roleKey)?.key ??
    roles.find((role) => role.key === DEFAULT_ROLE)?.key ??
    roles[0]?.key ??
    ''
  const selectedRole = roles.find((role) => role.key === selectedKey) ?? null

  async function handleGrant(event) {
    event.preventDefault()
    if (!selectedKey || busy) return
    setBusy(true)
    setError('')
    try {
      const { user, emailed, invitationUrl, invitationExpiresAt } = await onCreateUser({
        name: athlete.fullName,
        email,
        role: selectedKey,
        sendEmail,
      })
      setGranted({
        name: user?.name ?? athlete.fullName,
        email: user?.email ?? email,
        open: false,
        roleName: selectedRole?.name ?? '',
        password: null,
        emailed,
        emailRequested: sendEmail,
        invitationUrl: invitationUrl ?? null,
        expiresAt: invitationExpiresAt ?? null,
        mode: 'invitation',
      })
    } catch (failure) {
      setError(
        failure?.status === 409
          ? t('admin.athleteDetail.panelAccess.errorTaken')
          : (failure?.message ?? t('admin.athleteDetail.panelAccess.error')),
      )
    } finally {
      setBusy(false)
    }
  }

  const headingId = `${selectId}-title`

  return (
    <section className="athlete-detail__access" aria-labelledby={headingId}>
      <h3 id={headingId} className="athlete-detail__group-title">
        {t('admin.athleteDetail.panelAccess.title')}
      </h3>

      {granted ? (
        <StaffInvitationNotice
          key={granted.invitationUrl ?? granted.email}
          info={granted}
          locale={locale}
          onDismiss={() => setGranted(null)}
          t={t}
        />
      ) : account ? (
        <div className="athlete-detail__access-state">
          <span className="athlete-detail__access-icon" aria-hidden>
            <ShieldCheck size={16} />
          </span>
          <div className="athlete-detail__access-copy">
            <p className="athlete-detail__access-line">
              <strong>{getRoleLabel(account)}</strong>
              <span
                className={`athlete-detail__access-status athlete-detail__access-status--${account.status ?? 'active'}`}
              >
                {t(STATUS_KEYS[account.status] ?? 'admin.users.statusUnknown')}
              </span>
            </p>
            <p className="athlete-detail__access-note">
              {account.status === 'invited'
                ? t('admin.athleteDetail.panelAccess.pending')
                : t('admin.athleteDetail.panelAccess.active', { email })}
            </p>
          </div>
          {onOpenUsers ? (
            <button type="button" className="admin-users__link" onClick={onOpenUsers}>
              <UserCog size={15} aria-hidden />
              <span>{t('admin.athleteDetail.panelAccess.openUsers')}</span>
            </button>
          ) : null}
        </div>
      ) : !email ? (
        <p className="athlete-detail__access-note">
          {t('admin.athleteDetail.panelAccess.noEmail')}
        </p>
      ) : (
        <form className="athlete-detail__access-form" onSubmit={handleGrant} noValidate>
          <p className="athlete-detail__access-note">
            {t('admin.athleteDetail.panelAccess.lead', { email })}
          </p>
          <div className="athlete-detail__access-row">
            <label className="athlete-detail__edit-field" htmlFor={`${selectId}-role`}>
              <span>{t('admin.columns.role')}</span>
              <select
                id={`${selectId}-role`}
                value={selectedKey}
                disabled={busy || roles.length === 0}
                onChange={(event) => setRoleKey(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy || !selectedKey}>
              <ShieldCheck size={14} aria-hidden />
              {busy
                ? t('admin.athleteDetail.panelAccess.granting')
                : t('admin.athleteDetail.panelAccess.grant')}
            </Button>
          </div>
          {selectedRole?.description ? (
            <p className="athlete-detail__access-note">{selectedRole.description}</p>
          ) : null}
          <label className="admin-users__send-email">
            <input
              type="checkbox"
              checked={sendEmail}
              disabled={busy}
              onChange={(event) => setSendEmail(event.target.checked)}
            />
            <span>{t('admin.users.sendEmail')}</span>
          </label>
          {error ? (
            <p className="athlete-detail__edit-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  )
}
