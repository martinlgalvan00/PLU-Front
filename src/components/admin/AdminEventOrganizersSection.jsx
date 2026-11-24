import { useMemo, useState } from 'react'
import { CalendarCheck, UserPlus } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { Field } from '../ui/FormFields.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { isEventScopedRole } from '../../lib/permissions.js'
import { isPendingInviteEmail, PENDING_INVITE_NAME } from '../../lib/staffInvitationRoute.js'
import '../../styles/pages/admin-event-organizers.css'

function displayName(t, user) {
  if (isPendingInviteEmail(user?.email) && (!user.name || user.name === PENDING_INVITE_NAME)) {
    return t('admin.users.openInviteName')
  }
  return user?.name || user?.email || '—'
}

/**
 * Organizadores autorizados para ESTE evento.
 *
 * Solo PLU (admin.users.write): invita una cuenta Organizador ya atada al meet,
 * o suma este evento a un organizador existente. El corte de API sigue siendo
 * UserEventAccess + eventScope.
 */
export default function AdminEventOrganizersSection({
  canManage = false,
  eventId,
  eventTitle,
  onCreateOrganizer,
  onSetEventAccess,
  users = [],
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [assignUserId, setAssignUserId] = useState('')

  const organizersHere = useMemo(
    () =>
      users.filter(
        (user) =>
          isEventScopedRole(user.roleKey ?? user.role) &&
          (user.eventAccess ?? []).some((grant) => grant.eventId === eventId),
      ),
    [eventId, users],
  )

  const assignableOrganizers = useMemo(
    () =>
      users.filter(
        (user) =>
          isEventScopedRole(user.roleKey ?? user.role) &&
          !(user.eventAccess ?? []).some((grant) => grant.eventId === eventId),
      ),
    [eventId, users],
  )

  if (!canManage || !eventId) return null

  async function handleInvite(event) {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (cleanName.length < 3) {
      setError(t('admin.users.errorName'))
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError(t('admin.users.errorEmail'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onCreateOrganizer({
        name: cleanName,
        email: cleanEmail,
        role: 'organizador_evento',
        eventIds: [eventId],
        sendEmail: true,
      })
      setName('')
      setEmail('')
      setNotice(t('admin.eventOrganizers.inviteSuccess', { name: cleanName }))
    } catch (err) {
      setError(
        err?.status === 409
          ? t('admin.users.errorEmailTaken')
          : (err?.message ?? t('admin.users.errorCreate')),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign(event) {
    event.preventDefault()
    if (!assignUserId || !onSetEventAccess) return
    const target = users.find((user) => user.id === assignUserId)
    if (!target) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const currentIds = (target.eventAccess ?? []).map((grant) => grant.eventId)
      await onSetEventAccess(target.id, [...new Set([...currentIds, eventId])])
      setAssignUserId('')
      setNotice(
        t('admin.eventOrganizers.assignSuccess', { name: displayName(t, target) }),
      )
    } catch (err) {
      setError(err?.message ?? t('admin.users.eventAccess.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(user) {
    if (!onSetEventAccess) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const nextIds = (user.eventAccess ?? [])
        .map((grant) => grant.eventId)
        .filter((id) => id !== eventId)
      await onSetEventAccess(user.id, nextIds)
      setNotice(t('admin.eventOrganizers.removeSuccess', { name: displayName(t, user) }))
    } catch (err) {
      setError(err?.message ?? t('admin.users.eventAccess.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-event-organizers" aria-labelledby="admin-event-organizers-title">
      <header className="admin-event-organizers__head">
        <span className="admin-event-organizers__icon" aria-hidden>
          <CalendarCheck size={16} />
        </span>
        <div>
          <h3 id="admin-event-organizers-title">{t('admin.eventOrganizers.title')}</h3>
          <p>{t('admin.eventOrganizers.lead', { event: eventTitle })}</p>
        </div>
      </header>

      {organizersHere.length === 0 ? (
        <p className="admin-event-organizers__empty">{t('admin.eventOrganizers.empty')}</p>
      ) : (
        <ul className="admin-event-organizers__list">
          {organizersHere.map((user) => (
            <li key={user.id}>
              <span>
                <strong>{displayName(t, user)}</strong>
                <small>{isPendingInviteEmail(user.email) ? t('admin.users.openInviteEmail') : user.email}</small>
              </span>
              <button
                type="button"
                className="admin-event-organizers__remove"
                disabled={busy}
                onClick={() => void handleRemove(user)}
              >
                {t('admin.eventOrganizers.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="admin-event-organizers__invite" onSubmit={handleInvite} noValidate>
        <h4>{t('admin.eventOrganizers.inviteTitle')}</h4>
        <div className="admin-event-organizers__fields">
          <Field
            label={t('admin.users.name')}
            name="organizerName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <Field
            label={t('admin.users.email')}
            name="organizerEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <Button type="submit" variant="gold" className="btn--small" disabled={busy}>
          <UserPlus size={14} aria-hidden />
          {busy ? t('admin.users.creating') : t('admin.eventOrganizers.invite')}
        </Button>
      </form>

      {assignableOrganizers.length > 0 && onSetEventAccess ? (
        <form className="admin-event-organizers__assign" onSubmit={handleAssign}>
          <h4>{t('admin.eventOrganizers.assignTitle')}</h4>
          <label className="admin-event-organizers__select">
            <span>{t('admin.eventOrganizers.assignLabel')}</span>
            <select
              value={assignUserId}
              disabled={busy}
              onChange={(e) => setAssignUserId(e.target.value)}
            >
              <option value="">{t('admin.eventOrganizers.assignPlaceholder')}</option>
              {assignableOrganizers.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayName(t, user)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="btn--small" disabled={busy || !assignUserId}>
            {t('admin.eventOrganizers.assign')}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="admin-event-organizers__notice admin-event-organizers__notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-event-organizers__notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
