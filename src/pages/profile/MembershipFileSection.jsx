import { useMemo, useState } from 'react'
import { DateField, Field, Select } from '../../components/ui/FormFields.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getFormOptions } from '../../lib/formOptions.js'
import { membershipFileStatus } from '../../../shared/membershipFile.js'
import '../../styles/components/athlete-documents.css'

function readFile(athlete) {
  return {
    fullName: athlete?.fullName ?? '',
    documentId: athlete?.documentId ?? '',
    birthDate: String(athlete?.birthDate ?? '').slice(0, 10),
    sex: athlete?.sex ?? '',
    phone: athlete?.phone ?? '',
    country: athlete?.country || 'Argentina',
    province: athlete?.province ?? '',
    city: athlete?.city ?? '',
  }
}

export default function MembershipFileSection({ athlete, onSave }) {
  const { t } = useI18n()
  const options = getFormOptions(t)
  const [form, setForm] = useState(() => readFile(athlete))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const asked = useMemo(() => {
    const current = membershipFileStatus(athlete)
    return [...current.missing, ...current.invalid]
  }, [athlete])
  const status = membershipFileStatus(form)

  function changeField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function fieldError(key) {
    if (!submitted) return ''
    if (status.missing.includes(key)) return t('account.membershipFile.required')
    if (!status.invalid.includes(key)) return ''
    if (key === 'birthDate') return t('account.membershipFile.tooYoung')
    if (key === 'documentId') return t('account.membershipFile.invalidDocument')
    if (key === 'phone') return t('account.membershipFile.invalidPhone')
    return t('account.membershipFile.required')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (!status.complete || !onSave) return
    setSaving(true)
    try {
      const result = await onSave(athlete.id, {
        fullName: form.fullName.trim(),
        documentId: form.documentId,
        birthDate: form.birthDate,
        sex: form.sex,
        phone: form.phone.trim(),
        country: form.country,
        province: form.province.trim(),
        city: form.city.trim(),
      })
      if (result?.error) setFormError(result.error)
    } catch (error) {
      setFormError(error?.message || 'No se pudo guardar la ficha. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const show = (key) => asked.includes(key)

  return (
    <section className="account-data-group account-membership-file" aria-labelledby="account-membership-file-title">
      <div className="account-data-group__header">
        <div className="account-data-group__meta">
          <p className="account-data-group__label">{t('account.membershipFile.eyebrow')}</p>
          <h3 id="account-membership-file-title" className="account-data-group__title">
            {t('account.membershipFile.title')}
          </h3>
          <p className="account-data-group__note">{t('account.membershipFile.lead')}</p>
        </div>
      </div>
      <form className="account-membership-file__form" onSubmit={handleSubmit}>
        <div className="account-membership-file__fields">
          {show('fullName') ? (
            <Field
              className="field--wide"
              label={t('account.personalData.fullName')}
              name="fullName"
              value={form.fullName}
              autoComplete="name"
              onChange={changeField}
              error={fieldError('fullName')}
            />
          ) : null}
          {show('documentId') ? (
            <Field
              label={t('account.personalData.documentId')}
              name="documentId"
              value={form.documentId}
              inputMode="numeric"
              autoComplete="off"
              onChange={changeField}
              error={fieldError('documentId')}
            />
          ) : null}
          {show('birthDate') ? (
            <DateField
              label={t('account.personalData.birthDate')}
              name="birthDate"
              value={form.birthDate}
              onChange={changeField}
              error={fieldError('birthDate')}
            />
          ) : null}
          {show('sex') ? (
            <Select
              label={t('account.personalData.sex')}
              name="sex"
              value={form.sex}
              options={options.sex}
              onChange={changeField}
              error={fieldError('sex')}
            />
          ) : null}
          {show('phone') ? (
            <Field
              label={t('account.personalData.phone')}
              name="phone"
              value={form.phone}
              inputMode="tel"
              autoComplete="tel"
              onChange={changeField}
              error={fieldError('phone')}
            />
          ) : null}
          {show('country') ? (
            <Select
              label={t('account.membershipFile.country')}
              name="country"
              value={form.country}
              options={options.country}
              onChange={changeField}
              error={fieldError('country')}
            />
          ) : null}
          {show('province') ? (
            <Field
              label={t('account.personalData.province')}
              name="province"
              value={form.province}
              autoComplete="address-level1"
              onChange={changeField}
              error={fieldError('province')}
            />
          ) : null}
          {show('city') ? (
            <Field
              label={t('account.personalData.city')}
              name="city"
              value={form.city}
              autoComplete="address-level2"
              onChange={changeField}
              error={fieldError('city')}
            />
          ) : null}
        </div>
        {formError ? (
          <p className="account-membership-file__error" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="account-data-group__footer">
          <button type="submit" className="account-primary-action" disabled={saving || !onSave}>
            {saving ? t('account.membershipFile.saving') : t('account.membershipFile.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
