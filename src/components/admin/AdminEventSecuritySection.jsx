import { useEffect, useState } from 'react'
import { Check, Copy, Mail, QrCode, Shield, ShieldOff, UserPlus, Users } from 'lucide-react'
import Button from '../ui/Button.jsx'
import Pill from '../ui/Pill.jsx'
import { Field } from '../ui/FormFields.jsx'
import { AdminIdentityCell } from './AdminTableCells.jsx'
import SecurityCredentialModal from './SecurityCredentialModal.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'

const EMPTY_DRAFT = { name: '', email: '' }
const EMAIL_RE = /^\S+@\S+\.\S+$/

/**
 * Parsea el textarea de alta masiva. Cada línea es "Nombre, email" o solo
 * "email" (en cuyo caso el nombre se deriva del local-part). Deduplica por
 * email quedándose con la primera aparición y separa las líneas inválidas.
 */
function parseBulkLines(raw) {
  const seen = new Set()
  const entries = []
  const invalid = []

  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const hasComma = line.includes(',')
      const email = (hasComma ? line.slice(line.indexOf(',') + 1) : line).trim().toLowerCase()
      if (!EMAIL_RE.test(email)) {
        invalid.push(line)
        return
      }
      if (seen.has(email)) return
      seen.add(email)

      let name = hasComma ? line.slice(0, line.indexOf(',')).trim() : ''
      if (name.length < 3) name = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
      if (name.length < 3) name = email

      entries.push({ name, email })
    })

  return { entries, invalid }
}

/**
 * Cuentas seguridad_plu_arg de este evento puntual: quién tiene acceso a
 * /evento/:slug/seguridad, con alta (individual o masiva), envío de
 * credenciales por email y baja (individual o total). Separado a propósito
 * de la sección "Usuarios" (todos los roles) y de "Check-in" (el scanner).
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
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState('single')
  const [sendEmail, setSendEmail] = useState(false)

  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [tempPassword, setTempPassword] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkCopied, setBulkCopied] = useState(false)

  const [copied, setCopied] = useState(false)
  const [pendingStatusId, setPendingStatusId] = useState(null)
  const [confirmingDeactivateAll, setConfirmingDeactivateAll] = useState(false)
  const [deactivatingAll, setDeactivatingAll] = useState(false)
  const [credentialUser, setCredentialUser] = useState(null)

  const gatePath = eventSlug ? buildSecurityGatePath(eventSlug) : ''
  const gateUrl = gatePath && typeof window !== 'undefined' ? `${window.location.origin}${gatePath}` : gatePath
  const activeCount = users.filter((user) => user.status === 'active').length

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
    if (!EMAIL_RE.test(draft.email.trim())) {
      setFormError(t('admin.users.errorEmail'))
      return
    }

    setFormError('')
    setTempPassword(null)
    setIsSubmitting(true)
    try {
      const { user, tempPassword: password, emailed } = await onCreateSecurityUser({ ...draft, eventId, sendEmail })
      setUsers((current) => [user, ...current])
      setTempPassword({ email: user.email, password, emailed })
      setDraft(EMPTY_DRAFT)
    } catch (error) {
      setFormError(error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddBulk(event) {
    event.preventDefault()
    const { entries, invalid } = parseBulkLines(bulkText)
    if (invalid.length) {
      setBulkError(t('admin.eventEditor.security.bulkInvalidLines', { lines: invalid.join(', ') }))
      return
    }
    if (entries.length === 0) {
      setBulkError(t('admin.eventEditor.security.bulkEmpty'))
      return
    }

    setBulkError('')
    setBulkResult(null)
    setBulkSubmitting(true)
    try {
      const { created, skipped } = await onCreateSecurityUsersBulk({ eventId, users: entries, sendEmail })
      if (created.length) {
        setUsers((current) => [...created.map((item) => item.user), ...current])
      }
      setBulkResult({ created, skipped })
      setBulkText('')
    } catch (error) {
      setBulkError(error?.body?.error ?? t('admin.users.errorCreate'))
    } finally {
      setBulkSubmitting(false)
    }
  }

  async function handleCopyBulkCredentials() {
    if (!bulkResult?.created.length) return
    const text = bulkResult.created
      .map((item) => `${item.user.name} <${item.user.email}>: ${item.tempPassword}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setBulkCopied(true)
      setTimeout(() => setBulkCopied(false), 2000)
    } catch {
      // Idem handleCopyLink: sin clipboard las credenciales igual están en pantalla.
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

  async function handleDeactivateAll() {
    setDeactivatingAll(true)
    try {
      await onDeactivateAllSecurityUsers(eventId)
      setUsers((current) => current.map((user) => ({ ...user, status: 'disabled' })))
      setConfirmingDeactivateAll(false)
    } catch {
      setLoadError(t('admin.eventEditor.security.errorStatus'))
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
        <>
          <div className="admin-event-security__modes" role="tablist" aria-label={t('admin.eventEditor.security.addUser')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'single'}
              className={`admin-event-security__mode${mode === 'single' ? ' is-active' : ''}`}
              onClick={() => setMode('single')}
            >
              <UserPlus size={14} aria-hidden />
              {t('admin.eventEditor.security.modeSingle')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'bulk'}
              className={`admin-event-security__mode${mode === 'bulk' ? ' is-active' : ''}`}
              onClick={() => setMode('bulk')}
            >
              <Users size={14} aria-hidden />
              {t('admin.eventEditor.security.modeBulk')}
            </button>
          </div>

          <label className="admin-event-security__send-email">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <Mail size={13} aria-hidden />
            {t('admin.eventEditor.security.sendEmail')}
          </label>

          {mode === 'single' ? (
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
          ) : (
            <form className="admin-users__add-form admin-users__add-form--compact" onSubmit={handleAddBulk}>
              <label className="admin-event-security__bulk-field">
                <span>{t('admin.eventEditor.security.bulkLabel')}</span>
                <textarea
                  className="admin-event-security__bulk-input"
                  rows={5}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={t('admin.eventEditor.security.bulkPlaceholder')}
                />
                <small className="admin-event-security__bulk-hint">{t('admin.eventEditor.security.bulkHint')}</small>
              </label>
              <div className="admin-users__add-form-actions">
                <Button type="submit" className="btn--small admin-users__add-btn" disabled={bulkSubmitting}>
                  <Users size={14} aria-hidden />
                  {bulkSubmitting ? t('admin.users.creating') : t('admin.eventEditor.security.bulkSubmit')}
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {formError && (
        <p className="admin-users__form-error" role="alert">
          {formError}
        </p>
      )}
      {bulkError && (
        <p className="admin-users__form-error" role="alert">
          {bulkError}
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
          {tempPassword.emailed && (
            <p className="admin-event-security__emailed">
              <Mail size={12} aria-hidden />
              {t('admin.eventEditor.security.emailSent')}
            </p>
          )}
          <p className="admin-users__temp-password-note">{t('admin.users.tempPasswordWarn')}</p>
        </div>
      )}

      {bulkResult && (
        <div className="admin-event-security__bulk-result" role="status">
          <div className="admin-event-security__bulk-result-head">
            <p className="admin-users__temp-password-title">
              {t('admin.eventEditor.security.bulkResultTitle', {
                created: bulkResult.created.length,
                skipped: bulkResult.skipped.length,
              })}
            </p>
            {bulkResult.created.length > 0 && (
              <button
                type="button"
                className={`admin-event-security__copy${bulkCopied ? ' admin-event-security__copy--done' : ''}`}
                onClick={handleCopyBulkCredentials}
              >
                {bulkCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {bulkCopied ? t('admin.eventEditor.security.copied') : t('admin.eventEditor.security.bulkCopyAll')}
              </button>
            )}
          </div>

          {bulkResult.created.length > 0 && (
            <ul className="admin-event-security__bulk-created">
              {bulkResult.created.map((item) => (
                <li key={item.user.id}>
                  <span className="admin-event-security__bulk-created-who">
                    {item.user.name} · {item.user.email}
                  </span>
                  <code>{item.tempPassword}</code>
                  {item.emailed && <Mail size={12} aria-hidden className="admin-event-security__emailed-icon" />}
                </li>
              ))}
            </ul>
          )}

          {bulkResult.skipped.length > 0 && (
            <ul className="admin-event-security__bulk-skipped">
              {bulkResult.skipped.map((item) => (
                <li key={item.email}>
                  {item.email} — {t(`admin.eventEditor.security.skipReason.${item.reason}`)}
                </li>
              ))}
            </ul>
          )}

          <p className="admin-users__temp-password-note">{t('admin.users.tempPasswordWarn')}</p>
        </div>
      )}

      {loadError && <p className="admin-users__form-error">{loadError}</p>}

      {loading ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.loading')}</p>
      ) : users.length === 0 ? (
        <p className="admin-event-security__empty">{t('admin.eventEditor.security.empty')}</p>
      ) : (
        <>
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
      )}

      {credentialUser && (
        <SecurityCredentialModal
          user={credentialUser}
          onGenerate={(sendEmail) => onCreateSecurityAccessLink(credentialUser.id, sendEmail)}
          onClose={() => setCredentialUser(null)}
        />
      )}
    </fieldset>
  )
}
