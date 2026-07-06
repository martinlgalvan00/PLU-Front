import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { Field } from '../../components/ui/FormFields.jsx'
import { formatShortDate } from '../../lib/format.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PersonalDataSection({ athlete, onUpdateProfile }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    email: athlete.email ?? '',
    phone: athlete.phone ?? '',
    city: athlete.city ?? '',
    province: athlete.province ?? '',
    gym: athlete.gym ?? '',
  })
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
    if (!EMAIL_PATTERN.test(form.email)) nextErrors.email = t('account.personalData.errorEmail')
    if (!form.phone.trim()) nextErrors.phone = t('account.personalData.errorPhone')

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    onUpdateProfile(athlete.id, form)
    setMessage(t('account.personalData.saved'))
  }

  return (
    <section id="account-personal-data" className="account-section account-section--gold">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold"><UserRound size={21} /></div>
        <div><span>{t('account.personalData.eyebrow')}</span><h2>{t('account.personalData.title')}</h2></div>
      </div>
      <p className="account-section__lead">{t('account.personalData.lead')}</p>

      <div className="form-grid">
        <div className="field field--readonly">
          <span>{t('account.personalData.fullName')}</span>
          <strong>{athlete.fullName}</strong>
        </div>
        <div className="field field--readonly">
          <span>{t('account.personalData.documentId')}</span>
          <strong>{athlete.documentId}</strong>
        </div>
        <div className="field field--readonly">
          <span>{t('account.personalData.birthDate')}</span>
          <strong>{formatShortDate(athlete.birthDate)}</strong>
        </div>
      </div>
      <p className="account-security-note">{t('account.personalData.readonlyNote')}</p>

      <form className="form-grid" onSubmit={handleSubmit} noValidate>
        <Field
          error={errors.email}
          label={t('account.personalData.email')}
          name="email"
          type="email"
          value={form.email}
          onChange={changeField}
        />
        <Field
          error={errors.phone}
          label={t('account.personalData.phone')}
          name="phone"
          value={form.phone}
          onChange={changeField}
        />
        <Field
          label={t('account.personalData.gym')}
          name="gym"
          value={form.gym}
          onChange={changeField}
        />
        <Field
          label={t('account.personalData.city')}
          name="city"
          value={form.city}
          onChange={changeField}
        />
        <Field
          label={t('account.personalData.province')}
          name="province"
          value={form.province}
          onChange={changeField}
        />
        <div className="account-security-actions">
          <button type="submit" className="account-primary-action">{t('account.personalData.save')}</button>
        </div>
      </form>
      {message && <p className="account-checkout-message" role="status">{message}</p>}
    </section>
  )
}
