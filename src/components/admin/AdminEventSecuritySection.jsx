import { useEffect, useState } from 'react'
import { Check, Copy, Shield, ShieldOff, UserPlus } from 'lucide-react'
import Button from '../ui/Button.jsx'
import Pill from '../ui/Pill.jsx'
import { Field } from '../ui/FormFields.jsx'
import { AdminIdentityCell } from './AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'

const EMPTY_DRAFT = { name: '', email: '' }

/**
 * Cuentas seguridad_plu_arg de este evento puntual: quién tiene acceso a
 * /evento/:slug/seguridad, con alta y baja. Separado a propósito de la
 * sección "Usuarios" (todos los roles, sin agrupar por evento) y de
 * "Check-in" (el scanner en sí) -- acá es solo gestión de accesos.
 */
export default function AdminEventSecuritySection({
  canManageUsers,
  eventId,
  eventSlug,
  onCreateSecurityUser,
  onListSecurityUsers,
  onUpdateSecurityUserStatus,
}) {
  const { t } = useI18n()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [tempPassword, setTempPassword] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingStatusId, setPendingStatusId] = useState(null)

  const gatePath = eventSlug ? buildSecurityGatePath(eventSlug) : ''
  const gateUrl = gatePath && typeof window !== 'undefined' ? `${window.location.origin}${gatePath}` : gatePath

  useEffect(() => {
    let active = true
    if (!eventId) return undefined

    setLoading(true)
    setLoadError('')
    onListSecurityUsers(eventId)
      .then((rows) => {
        if (active) setUsers(rows)
      })
      .catch((error) => {
        if (active) setLoadError(error?.message ?? t('admin.eventEditor.security.errorLoad'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventId, onListSecurityUsers, t])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(gateUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API puede fallar sin permisos/HTTPS -- no es crítico, el
      // link ya queda visible en pantalla para copiar a mano.
    }
  }

  async function handleAddUser(event) {
    event.preventDefault()
    if (draft.name.trim().length < 3) {
      setFormError(t('admin.users.errorName'))
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
      setFormError(t('admin.users.errorEmail'))
      return
    }

    setFormError('')
    setTempPassword(null)
    setIsSubmitting(true)
    try {
      const { user, tempPassword: password } = await onCreateSecurityUser({ ...draft, eventId })
      setUsers((current) => [user, ...current])
      setTempPassword({ email: user.email, password })
      setDraft(EMPTY_DRAFT)
    } catch (error) {
      setFormError(error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setPendingStatusId(user.id)
    try {
      const updated = await onUpdateSecurityUserStatus(user.id, nextStatus)
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch {
      setLoadError(t('admin.eventEditor.security.errorStatus'))
    } finally {
      setPendingStatusId(null)
    }
  }

  return (
    <fieldset className="admin-event-form__pricing admin-event-security">
      <legend>
        <Shield size={14} aria-hidden />
        {t('admin.eventEditor.security.title')}
      </legend>
      <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.security.lead')}</p>

      {gateUrl && (
        <div className="admin-event-security__link">
          <code>{gateUrl}</code>
          <button
            type="button"
            className={`admin-event-security__copy${copied ? ' admin-event-security__copy--done' : ''}`}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? t('admin.eventEditor.security.copied') : t('admin.eventEditor.security.copyLink')}
          </button>
        </div>
      )}

      {canManageUsers && (
        <form className="admin-users__add-form admin-users__add-form--compact" onSubmit={handleAddUser}>
          <div className="admin-users__add-form-fields">
            <Field
              label={t('admin.users.name')}
              name="name"
              value={draft.name}
              onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
              placeholder={t('admin.users.namePlaceholder')}
              autoComplete="name"
            />
            <Field
              label={t('admin.users.email')}
              name="email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))}
              placeholder="nombre@pluarg.com.ar"
              autoComplete="email"
            />
          </div>
          <div className="admin-users__add-form-actions">
            <Button type="submit" className="btn--small admin-users__add-btn" disabled={isSubmitting}>
              <UserPlus size={14} aria-hidden />
              {isSubmitting ? t('admin.users.creating') : t('admin.eventEditor.security.addUser')}
            </Button>
          </div>
        </form>
      )}

      {formError && (
        <p className="admin-users__form-error" role="alert">
          {formError}
        </p>
      )}
      {tempPassword && (
        <div className="admin-users__temp-password" role="status">
          <p className="admin-users__temp-password-title">{t('admin.users.tempPasswordTitle')}</p>
          <dl className="admin-users__temp-password-meta">
            <div>
              <dt>{t('admin.users.email')}</dt>
              <dd>{tempPassword.email}</dd>
            </div>
            <div>
              <dt>{t('admin.users.tempPasswordLabel')}</dt>
              <dd>
                <code>{tempPassword.password}</code>
              </dd>
            </div>
          </dl>
          <p className="admin-users__temp-password-note">{t('admin.users.tempPasswordWarn')}</p>
        </div>
      )}
      {loadError && <p className="admin-users__form-error">{loadError}</p>}

      {loading ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.loading')}</p>
      ) : users.length === 0 ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.empty')}</p>
      ) : (
        <ul className="admin-event-security__list">
          {users.map((user) => {
            const active = user.status === 'active'
            return (
              <li key={user.id} className="admin-event-security__item">
                <AdminIdentityCell accent={active ? 'celeste' : 'gold'} name={user.name} sub={user.email} />
                <Pill tone={active ? 'success' : 'neutral'}>
                  {active ? t('admin.eventEditor.security.statusActive') : t('admin.eventEditor.security.statusDisabled')}
                </Pill>
                {canManageUsers && (
                  <button
                    type="button"
                    className={`admin-event-security__toggle${active ? ' admin-event-security__toggle--danger' : ' admin-event-security__toggle--celeste'}`}
                    disabled={pendingStatusId === user.id}
                    onClick={() => handleToggleStatus(user)}
                  >
                    {active ? <ShieldOff size={13} aria-hidden /> : <Shield size={13} aria-hidden />}
                    {active ? t('admin.eventEditor.security.deactivate') : t('admin.eventEditor.security.activate')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
