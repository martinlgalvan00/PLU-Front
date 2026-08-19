import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  HeartPulse,
  IdCard,
  Loader2,
  Mail,
  Trash2,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { DateField, Field, Select } from '../../components/ui/FormFields.jsx'
import { formatShortDate, initials } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import { getFormOptions } from '../../lib/formOptions.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RING_RADIUS = 48
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function PersonalDataSection({
  athlete,
  onUpdateProfile,
  onUpdatePhoto,
  onRemovePhoto,
}) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    email: athlete.email ?? '',
    phone: athlete.phone ?? '',
    city: athlete.city ?? '',
    province: athlete.province ?? '',
    gym: athlete.gym ?? '',
    sex: athlete.sex ?? '',
    fullName: athlete.fullName ?? '',
    birthDate: athlete.birthDate ?? '',
    country: athlete.country ?? '',
    emergencyContactName: athlete.emergencyContactName ?? '',
    emergencyContactPhone: athlete.emergencyContactPhone ?? '',
    instagramHandle: athlete.instagramHandle ?? '',
    bestTotalKg:
      athlete.bestTotalKg === null || athlete.bestTotalKg === undefined
        ? ''
        : String(athlete.bestTotalKg),
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success') // 'success' | 'error'
  const [saving, setSaving] = useState(false)
  const [photoStatus, setPhotoStatus] = useState('idle') // 'idle' | 'uploading' | 'error'
  const [photoError, setPhotoError] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => {
    const { missing } = isProfileComplete(athlete)
    return {
      contact: missing.some((field) => ['phone', 'city', 'province'].includes(field)),
      sports: missing.includes('gym'),
      emergency: false,
    }
  })
  const fileInputRef = useRef(null)

  // Libera el object URL del preview anterior cada vez que cambia o al desmontar.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // Una vez que la foto real llega por props (subida confirmada o eliminada),
  // el preview local ya cumplió su función.
  useEffect(() => {
    setPhotoPreview(null)
  }, [athlete.photoUrl])

  // Evaluar completitud del perfil mezclando lo que hay en BD + cambios locales del form
  const athleteWithForm = { ...athlete, ...form }
  const profileStatus = isProfileComplete(athleteWithForm)
  const formOptions = getFormOptions(t)
  const missingOfficialFields = ['fullName', 'birthDate', 'country'].filter(
    (field) => !String(athlete[field] ?? '').trim(),
  )
  const documentLabel =
    athlete.country === 'Argentina' || !athlete.country
      ? t('account.personalData.documentId')
      : t('account.personalData.documentIdPassport')

  async function processPhotoFile(file) {
    if (!file || !onUpdatePhoto) return
    if (!file.type.startsWith('image/')) return

    setPhotoPreview(URL.createObjectURL(file))
    setPhotoStatus('uploading')
    setPhotoError('')
    const result = await onUpdatePhoto(athlete.id, file)
    if (result?.error) {
      setPhotoStatus('error')
      setPhotoError(result.error)
      setPhotoPreview(null)
      return
    }
    setPhotoStatus('idle')
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    await processPhotoFile(file)
  }

  function handlePhotoDragOver(event) {
    event.preventDefault()
    if (photoStatus !== 'uploading') setIsDraggingPhoto(true)
  }

  function handlePhotoDragLeave() {
    setIsDraggingPhoto(false)
  }

  async function handlePhotoDrop(event) {
    event.preventDefault()
    setIsDraggingPhoto(false)
    if (photoStatus === 'uploading') return
    const file = event.dataTransfer.files?.[0]
    await processPhotoFile(file)
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
    if (!['Masculino', 'Femenino'].includes(form.sex)) nextErrors.sex = t('validation.sex')
    if (missingOfficialFields.includes('fullName') && form.fullName.trim().length < 3) {
      nextErrors.fullName = t('account.personalData.errorFullName')
    }
    if (missingOfficialFields.includes('birthDate') && !form.birthDate) {
      nextErrors.birthDate = t('account.personalData.errorBirthDate')
    }
    if (missingOfficialFields.includes('country') && !form.country) {
      nextErrors.country = t('account.personalData.errorCountry')
    }
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
  const ringOffset = RING_CIRCUMFERENCE * (1 - progressPercent / 100)

  return (
    <section id="account-personal-data" className="account-section account-section--gold">
      <header className="account-section__heading account-section__heading--personal">
        <div className="account-section__heading-copy">
          <span className="account-section__eyebrow">{t('account.personalData.eyebrow')}</span>
          <h2>
            {t('account.personalData.title')}
            {profileStatus.complete ? (
              <span
                className="account-profile-status account-profile-status--ok"
                title={t('account.personalData.profileComplete')}
              >
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                <span className="visually-hidden">{t('account.personalData.profileComplete')}</span>
              </span>
            ) : null}
          </h2>
          {!profileStatus.complete ? (
            <p className="account-profile-status account-profile-status--pending" role="status">
              {t(
                `account.personalData.profileIncomplete_${profileStatus.missing.length === 1 ? 'one' : 'other'}`,
                {
                  count: profileStatus.missing.length,
                },
              )}
            </p>
          ) : null}
        </div>
      </header>

      {!profileStatus.complete && (
        <div
          className="account-profile-progress"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('account.personalData.progressLabel')}
        >
          <div className="account-profile-progress__track">
            <div
              className="account-profile-progress__bar"
              style={{ transform: `scaleX(${progressPercent / 100})` }}
            />
          </div>
          <span className="account-profile-progress__label">
            {profileStatus.filled}/{profileStatus.total}{' '}
            {t('account.personalData.requiredForRegistration')}
          </span>
        </div>
      )}

      <p className="account-section__lead account-section__lead--compact">
        {t('account.personalData.lead')}
      </p>

      {/* Identidad: foto + datos oficiales readonly en una sola franja */}
      <div className="account-identity">
        <div className="account-identity__photo">
          <div className="account-photo__ring">
            <svg viewBox="0 0 104 104" aria-hidden="true">
              <circle className="account-photo__ring-track" cx="52" cy="52" r={RING_RADIUS} />
              <circle
                className="account-photo__ring-fill"
                cx="52"
                cy="52"
                r={RING_RADIUS}
                style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: ringOffset }}
              />
            </svg>
            <button
              type="button"
              className={`account-photo__avatar${isDraggingPhoto ? ' account-photo__avatar--dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handlePhotoDragOver}
              onDragLeave={handlePhotoDragLeave}
              onDrop={handlePhotoDrop}
              disabled={photoStatus === 'uploading'}
              aria-busy={photoStatus === 'uploading'}
              aria-label={
                athlete.photoUrl
                  ? t('account.personalData.photoChange')
                  : t('account.personalData.photoUpload')
              }
            >
              <span className="account-photo__avatar-frame">
                {photoPreview || athlete.photoUrl ? (
                  <img src={photoPreview || athlete.photoUrl} alt="" />
                ) : (
                  <span aria-hidden>{initials(athlete.fullName)}</span>
                )}
                <span className="account-photo__scrim" aria-hidden>
                  <Camera size={20} strokeWidth={1.75} />
                </span>
              </span>
              <span className="account-photo__badge" aria-hidden>
                {photoStatus === 'uploading' ? (
                  <Loader2 size={13} strokeWidth={2.25} />
                ) : (
                  <Camera size={13} strokeWidth={2.25} />
                )}
              </span>
            </button>
          </div>
          <div className="account-identity__photo-actions">
            <p className="account-photo__hint">{t('account.personalData.photoHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="account-photo__input"
              onChange={handlePhotoChange}
            />
            <span className="visually-hidden" role="status">
              {photoStatus === 'uploading' ? t('account.personalData.photoUploading') : ''}
            </span>
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
            {photoStatus === 'error' && (
              <p className="account-photo__error" role="alert">
                {photoError}
              </p>
            )}
          </div>
        </div>

        <div className="account-identity__official">
          <p className="account-data-group__label">{t('account.personalData.officialGroup')}</p>
          <h3 className="account-identity__name">{athlete.fullName}</h3>
          <dl className="account-identity__meta">
            <div className="account-identity__meta-item">
              <dt>{t('pages.register.country')}</dt>
              <dd>{athlete.country || '—'}</dd>
            </div>
            <div className="account-identity__meta-item">
              <dt>{documentLabel}</dt>
              <dd>{athlete.documentId}</dd>
            </div>
            <div className="account-identity__meta-item">
              <dt>{t('account.personalData.birthDate')}</dt>
              <dd>{formatShortDate(athlete.birthDate)}</dd>
            </div>
          </dl>
          <p className="account-identity__note">{t('account.personalData.readonlyNote')}</p>
        </div>
      </div>

      <form className="account-personal-form" onSubmit={handleSubmit} noValidate>
        {missingOfficialFields.length ? (
          <section className="account-data-group account-data-group--official-completion account-data-group--required">
            <div className="account-data-group__meta">
              <span className="account-data-group__icon" aria-hidden>
                <IdCard size={16} strokeWidth={1.75} />
              </span>
              <div className="account-data-group__summary-text">
                <p className="account-data-group__title">
                  {t('account.personalData.officialCompletionTitle')}
                </p>
                <p className="account-data-group__note">
                  {t('account.personalData.officialCompletionNote')}
                </p>
              </div>
            </div>
            <div className="form-grid form-grid--account account-data-group__content">
              {missingOfficialFields.includes('fullName') ? (
                <Field
                  error={errors.fullName}
                  label={`${t('account.personalData.fullName')} *`}
                  name="fullName"
                  value={form.fullName}
                  onChange={changeField}
                />
              ) : null}
              {missingOfficialFields.includes('birthDate') ? (
                <DateField
                  error={errors.birthDate}
                  label={`${t('account.personalData.birthDate')} *`}
                  name="birthDate"
                  value={form.birthDate}
                  onChange={changeField}
                />
              ) : null}
              {missingOfficialFields.includes('country') ? (
                <Select
                  error={errors.country}
                  label={`${t('pages.register.country')} *`}
                  name="country"
                  options={formOptions.country}
                  value={form.country}
                  onChange={changeField}
                />
              ) : null}
            </div>
          </section>
        ) : null}
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
              <span className="account-data-group__icon" aria-hidden>
                <Mail size={16} strokeWidth={1.75} />
              </span>
              <span className="account-data-group__summary-text">
                <span className="account-data-group__title">
                  {t('account.personalData.contactGroup')}
                </span>
                <span className="account-data-group__summary-note">
                  {t('account.personalData.contactSummary')}
                </span>
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
              <span className="account-data-group__icon" aria-hidden>
                <Dumbbell size={16} strokeWidth={1.75} />
              </span>
              <span className="account-data-group__summary-text">
                <span className="account-data-group__title">
                  {t('account.personalData.sportsGroup')}
                </span>
                <span className="account-data-group__summary-note">
                  {t('account.personalData.sportsSummary')}
                </span>
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
            <Select
              error={errors.sex}
              label={`${t('pages.register.sexCompetitive')} *`}
              name="sex"
              options={[
                ['', t('formOptions.selectPlaceholder')],
                ['Masculino', t('formOptions.sex.male')],
                ['Femenino', t('formOptions.sex.female')],
              ]}
              value={form.sex}
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
              <span className="account-data-group__icon" aria-hidden>
                <HeartPulse size={16} strokeWidth={1.75} />
              </span>
              <span className="account-data-group__summary-text">
                <span className="account-data-group__title">
                  {t('account.personalData.emergencyGroup')}
                </span>
                <span className="account-data-group__summary-note">
                  {t('account.personalData.emergencyNote')}
                </span>
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
