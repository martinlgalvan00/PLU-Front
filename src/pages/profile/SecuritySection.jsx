import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { Field } from '../../components/ui/FormFields.jsx'

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' }

export default function SecuritySection({ session }) {
  const { t } = useI18n()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  function changeField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setMessage('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.currentPassword) nextErrors.currentPassword = t('account.security.errorRequired')
    if (form.newPassword.length < 8) nextErrors.newPassword = t('account.security.errorLength')
    if (form.confirmPassword !== form.newPassword) nextErrors.confirmPassword = t('account.security.errorMatch')

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setForm(EMPTY_FORM)
    setMessage(t('account.security.passwordUpdated'))
  }

  return (
    <section id="account-security" className="account-section account-section--neutral">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--neutral"><KeyRound size={21} /></div>
        <div><span>{t('account.security.eyebrow')}</span><h2>{t('account.security.title')}</h2></div>
      </div>
      <p className="account-section__lead">{t('account.security.lead')}</p>

      <form className="form-grid form-grid--compact" onSubmit={handleSubmit} noValidate>
        <Field
          error={errors.currentPassword}
          label={t('account.security.currentPassword')}
          name="currentPassword"
          type="password"
          value={form.currentPassword}
          onChange={changeField}
        />
        <Field
          error={errors.newPassword}
          label={t('account.security.newPassword')}
          name="newPassword"
          type="password"
          value={form.newPassword}
          onChange={changeField}
        />
        <Field
          error={errors.confirmPassword}
          label={t('account.security.confirmPassword')}
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={changeField}
        />
        <div className="account-security-actions">
          <button type="submit" className="account-primary-action">{t('account.security.updatePassword')}</button>
        </div>
      </form>
      {message && <p className="account-checkout-message" role="status">{message}</p>}
      <p className="account-security-note">{t('account.security.demoNote')}</p>

      <dl className="account-transfer-data">
        <div><dt>{t('account.security.sessionEmail')}</dt><dd>{session?.email ?? '—'}</dd></div>
        <div><dt>{t('account.security.sessionRole')}</dt><dd>{t('account.security.sessionRoleAthlete')}</dd></div>
        <div><dt>{t('account.security.sessionDevice')}</dt><dd>{t('account.security.sessionDeviceValue')}</dd></div>
      </dl>
    </section>
  )
}
