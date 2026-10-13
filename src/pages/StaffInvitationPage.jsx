import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import '../styles/pages/design-phase2.css'
import '../styles/pages/auth.css'
import authVisualPhoto from '../assets/DSC00286-display.jpg'
import authVisualPhotoAvif from '../assets/DSC00286-display.avif'
import authVisualPhotoAvif480 from '../assets/DSC00286-display-480.avif'
import authVisualPhotoAvif800 from '../assets/DSC00286-display-800.avif'
import authVisualPhotoWebp from '../assets/DSC00286-display.webp'
import authVisualPhotoWebp480 from '../assets/DSC00286-display-480.webp'
import authVisualPhotoWebp800 from '../assets/DSC00286-display-800.webp'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import ResponsivePhoto from '../components/ui/ResponsivePhoto.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

const MIN_PASSWORD_LENGTH = 12

export default function StaffInvitationPage({ token, onAccept, onCancel, onLoadInvitation }) {
  const { t } = useI18n()
  // `invitation` queda en null si no hay forma de leerla (sin red, sin loader):
  // el formulario sigue funcionando y el servidor valida el enlace al enviar.
  const [invitation, setInvitation] = useState(null)
  const [isInvalid, setIsInvalid] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!onLoadInvitation) return undefined
    let cancelled = false
    onLoadInvitation(token)
      .then((data) => {
        if (cancelled) return
        setInvitation(data?.invitation ?? null)
        if (data?.invitation?.name) setName(data.invitation.name)
      })
      .catch((error) => {
        if (!cancelled && error?.status === 400) setIsInvalid(true)
      })
    return () => {
      cancelled = true
    }
  }, [onLoadInvitation, token])

  // Invitación abierta: la cuenta todavía no tiene persona, la completa quien
  // abre el enlace. En una nominal el nombre y el email ya los fijó el admin.
  const needsProfile = Boolean(invitation?.needsProfile)

  function validate() {
    const next = {}
    if (needsProfile) {
      if (name.trim().length < 3) next.name = t('staffAccount.errorNameRequired')
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('staffAccount.errorEmailInvalid')
    }
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('staffAccount.errorPasswordShort')
    if (!passwordConfirm) next.passwordConfirm = t('staffAccount.errorConfirmRequired')
    else if (password !== passwordConfirm)
      next.passwordConfirm = t('staffAccount.errorPasswordMismatch')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onAccept({
        token,
        password,
        ...(needsProfile ? { name: name.trim(), email: email.trim().toLowerCase() } : {}),
      })
    } catch (error) {
      setSubmitError(error?.message || t('staffAccount.invitationError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page auth-layout">
      <aside className="auth-layout__visual" aria-hidden="true">
        <ResponsivePhoto
          className="auth-layout__visual-photo"
          avif={{
            480: authVisualPhotoAvif480,
            800: authVisualPhotoAvif800,
            1153: authVisualPhotoAvif,
          }}
          webp={{
            480: authVisualPhotoWebp480,
            800: authVisualPhotoWebp800,
            1153: authVisualPhotoWebp,
          }}
          src={authVisualPhoto}
          alt=""
          width={800}
          height={1200}
          sizes="(min-width: 1024px) 45vw, 30vw"
          loading="eager"
          fetchPriority="high"
        />
        <div className="auth-layout__visual-scrim" />
        <div className="auth-layout__visual-content">
          <BrandLogo variant="letterhead" height={40} imgClassName="auth-layout__emblem" />
          <h2 className="auth-layout__slogan">
            {t('login.visualSlogan')}
            <span className="auth-layout__slogan-line">{t('login.visualSloganAccent')}</span>
          </h2>
          <p className="auth-layout__lead">{t('login.visualLead')}</p>
          <span className="auth-layout__rule" aria-hidden="true" />
          <p className="auth-layout__meta">{t('login.visualMeta')}</p>
        </div>
      </aside>

      <section className="auth-layout__content">
        <div className="auth-immersive-page">
          <div className="auth-immersive-glass" aria-labelledby="staff-invitation-heading">
            <header className="auth-immersive-glass__header">
              <BrandLogo
                variant="letterhead"
                imgClassName="auth-immersive-glass__logo"
                height={32}
              />
              <div className="auth-immersive-glass__copy">
                <span className="auth-immersive-glass__eyebrow">
                  {t('staffAccount.invitationEyebrow')}
                </span>
                <h1 id="staff-invitation-heading" className="auth-immersive-glass__title">
                  {needsProfile
                    ? t('staffAccount.invitationTitleOpen')
                    : t('staffAccount.invitationTitle')}
                </h1>
                <p className="auth-immersive-glass__lead">
                  {isInvalid
                    ? t('staffAccount.invitationError')
                    : needsProfile
                      ? t('staffAccount.invitationLeadOpen')
                      : t('staffAccount.invitationLead')}
                </p>
              </div>
            </header>

            {invitation && !isInvalid ? (
              <dl className="staff-invite-who">
                {!needsProfile ? (
                  <>
                    <div>
                      <dt>{t('staffAccount.invitationWho')}</dt>
                      <dd>{invitation.name}</dd>
                    </div>
                    <div>
                      <dt>{t('staffAccount.invitationLogin')}</dt>
                      <dd>{invitation.email}</dd>
                    </div>
                  </>
                ) : null}
                {invitation.roleName ? (
                  <div>
                    <dt>{t('staffAccount.invitationRole')}</dt>
                    <dd>{invitation.roleName}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {isInvalid ? (
              <form className="login-form" onSubmit={(event) => event.preventDefault()}>
                <button type="button" className="login-form__back" onClick={onCancel}>
                  <ArrowLeft size={14} aria-hidden />
                  {t('staffAccount.invitationCancel')}
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleSubmit} noValidate>
                {needsProfile ? (
                  <>
                    <label className={`login-field${fieldErrors.name ? ' is-invalid' : ''}`}>
                      <span className="login-field__label">{t('staffAccount.nameLabel')}</span>
                      <span className="login-field__control">
                        <User size={16} className="login-field__icon" aria-hidden />
                        <input
                          type="text"
                          name="name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          autoComplete="name"
                          autoFocus
                          aria-invalid={Boolean(fieldErrors.name)}
                          required
                        />
                      </span>
                      {fieldErrors.name ? (
                        <span className="login-field__error" role="alert">
                          <AlertCircle size={14} className="error-icon" />
                          <span>{fieldErrors.name}</span>
                        </span>
                      ) : null}
                    </label>
                    <label className={`login-field${fieldErrors.email ? ' is-invalid' : ''}`}>
                      <span className="login-field__label">{t('staffAccount.emailLabel')}</span>
                      <span className="login-field__control">
                        <Mail size={16} className="login-field__icon" aria-hidden />
                        <input
                          type="email"
                          name="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          aria-invalid={Boolean(fieldErrors.email)}
                          required
                        />
                      </span>
                      {fieldErrors.email ? (
                        <span className="login-field__error" role="alert">
                          <AlertCircle size={14} className="error-icon" />
                          <span>{fieldErrors.email}</span>
                        </span>
                      ) : (
                        <span className="login-form__hint">{t('staffAccount.emailHint')}</span>
                      )}
                    </label>
                  </>
                ) : null}
                <div className={`login-field${fieldErrors.password ? ' is-invalid' : ''}`}>
                  <label htmlFor="staff-invitation-password" className="login-field__label">
                    {t('staffAccount.newPassword')}
                  </label>
                  <span className="login-field__control">
                    <Lock size={16} className="login-field__icon" aria-hidden />
                    <input
                      id="staff-invitation-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      autoFocus={!needsProfile}
                      aria-invalid={Boolean(fieldErrors.password)}
                      required
                    />
                    <button
                      type="button"
                      className="login-field__toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </span>
                  {fieldErrors.password ? (
                    <span className="login-field__error" role="alert">
                      <AlertCircle size={14} className="error-icon" />
                      <span>{fieldErrors.password}</span>
                    </span>
                  ) : null}
                </div>

                <label className={`login-field${fieldErrors.passwordConfirm ? ' is-invalid' : ''}`}>
                  <span className="login-field__label">{t('staffAccount.confirmPassword')}</span>
                  <span className="login-field__control">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="passwordConfirm"
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.passwordConfirm)}
                      required
                    />
                  </span>
                  {fieldErrors.passwordConfirm ? (
                    <span className="login-field__error" role="alert">
                      <AlertCircle size={14} className="error-icon" />
                      <span>{fieldErrors.passwordConfirm}</span>
                    </span>
                  ) : null}
                </label>

                <button type="submit" className="login-submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? t('staffAccount.invitationSubmitting')
                    : t('staffAccount.invitationSubmit')}
                  {!isSubmitting && <ArrowRight size={16} aria-hidden />}
                </button>

                <p className="login-form__notice" role="note">
                  {t('staffAccount.invitationHint', { min: MIN_PASSWORD_LENGTH })}
                </p>

                {submitError ? (
                  <p className="form-submit-error" role="alert">
                    <AlertCircle size={14} className="error-icon" />
                    <span>{submitError}</span>
                  </p>
                ) : null}

                <button type="button" className="login-form__back" onClick={onCancel}>
                  <ArrowLeft size={14} aria-hidden />
                  {t('staffAccount.invitationCancel')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
