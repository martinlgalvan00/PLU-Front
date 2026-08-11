import { useRef, useState } from 'react'
import { Trash2, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { Field } from '../../components/ui/FormFields.jsx'
import { formatShortDate, initials } from '../../lib/format.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PersonalDataSection({ athlete, onUpdateProfile, onUpdatePhoto, onRemovePhoto }) {
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
  const [photoStatus, setPhotoStatus] = useState('idle') // 'idle' | 'uploading' | 'error'
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef(null)

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUpdatePhoto) return

    setPhotoStatus('uploading')
    setPhotoError('')
    const result = await onUpdatePhoto(athlete.id, file)
    if (result?.error) {
      setPhotoStatus('error')
      setPhotoError(result.error)
      return
    }
    setPhotoStatus('idle')
  }

  async function handlePhotoRemove() {
    if (!onRemovePhoto) return
    setPhotoStatus('uploading')
    setPhotoError('')
    const result = await onRemovePhoto(athlete.id)
    if (result?.error) {
      setPhotoStatus('error')
      setPhotoError(result.error)
      return
    }
    setPhotoStatus('idle')
  }

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

      <div className="account-photo">
        <div className="account-photo__avatar">
          {athlete.photoUrl ? (
            <img src={athlete.photoUrl} alt="" />
          ) : (
            <span aria-hidden>{initials(athlete.fullName)}</span>
          )}
        </div>
        <div className="account-photo__actions">
          <p className="account-photo__hint">{t('account.personalData.photoHint')}</p>
          <div className="account-photo__buttons">
            <button
              type="button"
              className="account-secondary-action"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoStatus === 'uploading'}
            >
              {photoStatus === 'uploading' ? t('account.personalData.photoUploading') : t('account.personalData.photoUpload')}
            </button>
            {athlete.photoUrl && (
              <button
                type="button"
                className="account-secondary-action account-secondary-action--danger"
                onClick={handlePhotoRemove}
                disabled={photoStatus === 'uploading'}
              >
                <Trash2 size={14} aria-hidden />
                {t('account.personalData.photoRemove')}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="account-photo__input"
            onChange={handlePhotoChange}
          />
          {photoStatus === 'error' && <p className="account-photo__error" role="alert">{photoError}</p>}
        </div>
      </div>

      <div className="account-data-group">
        <p className="account-data-group__label">{t('account.personalData.officialGroup')}</p>
        <div className="form-grid">
          <div className="field field--readonly">
            <span>{t('account.personalData.fullName')}</span>
            <span className="field__value">{athlete.fullName}</span>
          </div>
          <div className="field field--readonly">
            <span>{t('account.personalData.documentId')}</span>
            <span className="field__value">{athlete.documentId}</span>
          </div>
          <div className="field field--readonly">
            <span>{t('account.personalData.birthDate')}</span>
            <span className="field__value">{formatShortDate(athlete.birthDate)}</span>
          </div>
        </div>
        <p className="account-data-group__note">{t('account.personalData.readonlyNote')}</p>
      </div>

      <form className="account-data-group" onSubmit={handleSubmit} noValidate>
        <p className="account-data-group__label">{t('account.personalData.contactGroup')}</p>
        <div className="form-grid">
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
        </div>
      </form>
      {message && <p className="account-checkout-message" role="status">{message}</p>}
    </section>
  )
}
