import { useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, ChevronDown, Trash2, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { Field } from '../../components/ui/FormFields.jsx'
import { formatShortDate, initials } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PersonalDataSection({ athlete, onUpdateProfile, onUpdatePhoto, onRemovePhoto }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    email: athlete.email ?? '',
    phone: athlete.phone ?? '',
    city: athlete.city ?? '',
    province: athlete.province ?? '',
    gym: athlete.gym ?? '',
    emergencyContactName: athlete.emergencyContactName ?? '',
    emergencyContactPhone: athlete.emergencyContactPhone ?? '',
    instagramHandle: athlete.instagramHandle ?? '',
    bestTotalKg: athlete.bestTotalKg === null || athlete.bestTotalKg === undefined ? '' : String(athlete.bestTotalKg),
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success') // 'success' | 'error'
  const [saving, setSaving] = useState(false)
  const [photoStatus, setPhotoStatus] = useState('idle') // 'idle' | 'uploading' | 'error'
  const [photoError, setPhotoError] = useState('')
  const [openGroups, setOpenGroups] = useState(() => {
    const { missing } = isProfileComplete(athlete)
    return {
      contact: missing.some((field) => ['phone', 'city', 'province'].includes(field)),
      sports: missing.includes('gym'),
      emergency: false,
    }
  })
  const fileInputRef = useRef(null)

  // Evaluar completitud del perfil mezclando lo que hay en BD + cambios locales del form
  const athleteWithForm = { ...athlete, ...form }
  const profileStatus = isProfileComplete(athleteWithForm)

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

  function toggleGroup(group) {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!EMAIL_PATTERN.test(form.email)) nextErrors.email = t('account.personalData.errorEmail')
    if (!form.phone.trim()) nextErrors.phone = t('account.personalData.errorPhone')
    if (form.emergencyContactPhone.trim()) {
      const digits = form.emergencyContactPhone.replace(/\D/g, '')
      if (digits.length < 8 || digits.length > 15) {
        nextErrors.emergencyContactPhone = t('account.personalData.errorEmergencyPhone')
      }
    }
    const instagramHandle = form.instagramHandle.trim().replace(/^@/, '')
    if (instagramHandle && !/^[A-Za-z0-9._]{1,30}$/.test(instagramHandle)) {
      nextErrors.instagramHandle = t('account.personalData.errorInstagram')
    }
    if (form.bestTotalKg.trim()) {
      const total = Number(form.bestTotalKg.replace(',', '.').replace(/\s*kg$/i, ''))
      if (!Number.isFinite(total) || total < 10 || total > 2000) {
        nextErrors.bestTotalKg = t('account.personalData.errorBestTotal')
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setOpenGroups((current) => ({
        ...current,
        contact: current.contact || Boolean(nextErrors.email || nextErrors.phone),
        sports: current.sports || Boolean(nextErrors.instagramHandle || nextErrors.bestTotalKg),
        emergency: current.emergency || Boolean(nextErrors.emergencyContactPhone),
      }))
      return
    }

    setErrors({})
    setSaving(true)
    const bestTotalKg = form.bestTotalKg.trim()
      ? Number(form.bestTotalKg.replace(',', '.').replace(/\s*kg$/i, ''))
      : null
    const result = await onUpdateProfile(athlete.id, { ...form, instagramHandle, bestTotalKg })
    setSaving(false)
    if (result?.error) {
      setMessage(result.error)
      setMessageTone('error')
      return
    }
    setMessage(t('account.personalData.saved'))
    setMessageTone('success')
  }

  const progressPercent = Math.round((profileStatus.filled / profileStatus.total) * 100)

  return (
    <section id="account-personal-data" className="account-section account-section--gold">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold"><UserRound size={21} /></div>
        <div>
          <span>{t('account.personalData.eyebrow')}</span>
          <h2>{t('account.personalData.title')}</h2>
        </div>
        <div
          className={`account-profile-completeness ${profileStatus.complete ? 'is-complete' : 'is-incomplete'}`}
          aria-label={profileStatus.complete ? t('account.personalData.profileComplete') : undefined}
        >
          {profileStatus.complete ? (
            <>
              <CheckCircle2 size={14} aria-hidden />
              <span>{t('account.personalData.profileComplete')}</span>
            </>
          ) : (
            <>
              <AlertCircle size={14} aria-hidden />
              <span>{t(`account.personalData.profileIncomplete_${profileStatus.missing.length === 1 ? 'one' : 'other'}`, { count: profileStatus.missing.length })}</span>
            </>
          )}
        </div>
      </div>

      {!profileStatus.complete && (
        <div className="account-profile-progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Completitud del perfil">
          <div className="account-profile-progress__track">
            <div
              className="account-profile-progress__bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="account-profile-progress__label">
            {profileStatus.filled}/{profileStatus.total} {t('account.personalData.requiredForRegistration')}
          </span>
        </div>
      )}

      <p className="account-section__lead account-section__lead--compact">{t('account.personalData.lead')}</p>

      {/* Identidad: foto + datos oficiales readonly en una sola franja */}
      <div className="account-identity">
        <div className="account-identity__photo">
          <div className="account-photo__avatar">
            {athlete.photoUrl ? (
              <img src={athlete.photoUrl} alt="" />
            ) : (
              <span aria-hidden>{initials(athlete.fullName)}</span>
            )}
          </div>
          <div className="account-identity__photo-actions">
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
            <p className="account-photo__hint">{t('account.personalData.photoHint')}</p>
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

        <div className="account-identity__official">
          <p className="account-data-group__label">{t('account.personalData.officialGroup')}</p>
          <dl className="account-identity__facts">
            <div>
              <dt>{t('account.personalData.fullName')}</dt>
              <dd>{athlete.fullName}</dd>
            </div>
            <div>
              <dt>{t('account.personalData.documentId')}</dt>
              <dd>{athlete.documentId}</dd>
            </div>
            <div>
              <dt>{t('account.personalData.birthDate')}</dt>
              <dd>{formatShortDate(athlete.birthDate)}</dd>
            </div>
          </dl>
          <p className="account-identity__note">{t('account.personalData.readonlyNote')}</p>
        </div>
      </div>

      <form className="account-personal-form" onSubmit={handleSubmit} noValidate>
        <section
          className={`account-data-group account-data-group--disclosure account-data-group--required${openGroups.contact ? ' is-open' : ''}`}
        >
          <button
            type="button"
            className="account-data-group__summary"
            aria-expanded={openGroups.contact}
            aria-controls="account-contact-fields"
            onClick={() => toggleGroup('contact')}
          >
            <span className="account-data-group__summary-copy">
              <span className="account-data-group__label">{t('account.personalData.contactGroup')}</span>
              <span className="account-data-group__summary-note">
                {t('account.personalData.contactSummary')}
              </span>
            </span>
            <span className="account-data-group__summary-side">
              <span className="account-data-group__required-note">
                {t('account.personalData.requiredForRegistration')}
              </span>
              <ChevronDown size={18} aria-hidden />
            </span>
          </button>
          <div
            id="account-contact-fields"
            className="form-grid form-grid--account account-data-group__content"
            hidden={!openGroups.contact}
          >
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
              label={`${t('account.personalData.phone')} *`}
              name="phone"
              value={form.phone}
              onChange={changeField}
            />
            <Field
              label={`${t('account.personalData.city')} *`}
              name="city"
              value={form.city}
              onChange={changeField}
            />
            <Field
              label={`${t('account.personalData.province')} *`}
              name="province"
              value={form.province}
              onChange={changeField}
            />
          </div>
        </section>

        <section
          className={`account-data-group account-data-group--disclosure${openGroups.sports ? ' is-open' : ''}`}
        >
          <button
            type="button"
            className="account-data-group__summary"
            aria-expanded={openGroups.sports}
            aria-controls="account-sports-fields"
            onClick={() => toggleGroup('sports')}
          >
            <span className="account-data-group__summary-copy">
              <span className="account-data-group__label">{t('account.personalData.sportsGroup')}</span>
              <span className="account-data-group__summary-note">
                {t('account.personalData.sportsSummary')}
              </span>
            </span>
            <span className="account-data-group__summary-side">
              <span className="account-data-group__required-note">
                {t('account.personalData.requiredForRegistration')}
              </span>
              <ChevronDown size={18} aria-hidden />
            </span>
          </button>
          <div
            id="account-sports-fields"
            className="form-grid form-grid--account account-data-group__content"
            hidden={!openGroups.sports}
          >
            <Field
              label={`${t('account.personalData.gym')} *`}
              name="gym"
              value={form.gym}
              onChange={changeField}
            />
            <Field
              label={t('account.personalData.instagram')}
              name="instagramHandle"
              placeholder={t('account.personalData.instagramPlaceholder')}
              value={form.instagramHandle}
              error={errors.instagramHandle}
              onChange={changeField}
            />
            <Field
              error={errors.bestTotalKg}
              inputMode="decimal"
              label={t('account.personalData.bestTotal')}
              name="bestTotalKg"
              placeholder={t('account.personalData.bestTotalPlaceholder')}
              value={form.bestTotalKg}
              onChange={changeField}
            />
            <p className="account-data-group__note form-grid__span-full">
              {t('account.personalData.bestTotalNote')}
            </p>
          </div>
        </section>

        <section
          className={`account-data-group account-data-group--disclosure${openGroups.emergency ? ' is-open' : ''}`}
        >
          <button
            type="button"
            className="account-data-group__summary"
            aria-expanded={openGroups.emergency}
            aria-controls="account-emergency-fields"
            onClick={() => toggleGroup('emergency')}
          >
            <span className="account-data-group__summary-copy">
              <span className="account-data-group__label">{t('account.personalData.emergencyGroup')}</span>
              <span className="account-data-group__summary-note">
                {t('account.personalData.emergencyNote')}
              </span>
            </span>
            <span className="account-data-group__summary-side">
              <span className="account-data-group__optional-note">
                {t('account.personalData.optional')}
              </span>
              <ChevronDown size={18} aria-hidden />
            </span>
          </button>
          <div
            id="account-emergency-fields"
            className="form-grid form-grid--account account-data-group__content"
            hidden={!openGroups.emergency}
          >
            <Field
              label={t('account.personalData.emergencyName')}
              name="emergencyContactName"
              value={form.emergencyContactName}
              onChange={changeField}
            />
            <Field
              error={errors.emergencyContactPhone}
              label={t('account.personalData.emergencyPhone')}
              name="emergencyContactPhone"
              inputMode="tel"
              value={form.emergencyContactPhone}
              onChange={changeField}
            />
          </div>
        </section>

        <div className="account-data-group__footer">
          <button
            type="submit"
            className="account-primary-action"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? '…' : t('account.personalData.save')}
          </button>
          {message && (
            <p
              className={`account-save-result${messageTone === 'error' ? ' account-save-result--error' : ''}`}
              role="status"
            >
              {messageTone === 'success' && <CheckCircle2 size={14} aria-hidden />}
              {message}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
