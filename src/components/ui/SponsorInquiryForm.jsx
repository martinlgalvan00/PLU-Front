import { useState } from 'react'
import { ArrowRight, Check, Mail } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { SPONSOR_TIERS } from '../../data/sponsors.js'
import { buildMailtoHref, CONTACT_EMAIL } from '../../lib/contact.js'
import {
  buildSponsorInquiryMessage,
  normalizeSponsorTier,
  SPONSOR_SCOPES,
  SPONSOR_TIER_UNDECIDED,
} from '../../lib/sponsorInquiry.js'
import { submitContactMessage } from '../../services/contactService.js'

export const SPONSOR_BRAND_FIELD_ID = 'sponsor-inquiry-brand'

/**
 * Propuesta de alianza. Usa la misma ruta que Contacto (`motive: 'sponsor'`),
 * así que no agrega endpoints ni dependencias. El nivel elegido llega desde
 * la página para que "Consultar este nivel" lo preseleccione.
 */
export default function SponsorInquiryForm({ tier = SPONSOR_TIER_UNDECIDED, onTierChange }) {
  const { t } = useI18n()
  const [scope, setScope] = useState('undecided')
  const [status, setStatus] = useState('idle') // idle | submitting | sent | error
  const submitting = status === 'submitting'

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    setStatus('submitting')
    try {
      await submitContactMessage({
        name: data.get('name')?.toString().trim() ?? '',
        email: data.get('email')?.toString().trim() ?? '',
        message: buildSponsorInquiryMessage({
          brand: data.get('brand')?.toString() ?? '',
          scope,
          tier,
          contribution: data.get('contribution')?.toString() ?? '',
        }),
        motive: 'sponsor',
      })
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="sponsor-form__success" role="status" aria-live="polite">
        <span className="sponsor-form__success-icon" aria-hidden>
          <Check size={18} strokeWidth={2.5} />
        </span>
        <h3>{t('pages.sponsors.form.sentTitle')}</h3>
        <p>{t('pages.sponsors.form.sentDesc')}</p>
      </div>
    )
  }

  const mailHref = buildMailtoHref({ subject: t('pages.sponsors.form.mailSubject') })

  return (
    <form className="sponsor-form" onSubmit={handleSubmit}>
      <div className="sponsor-form__grid">
        <label className="sponsor-form__field sponsor-form__field--wide">
          <span>{t('pages.sponsors.form.brand')}</span>
          <input
            id={SPONSOR_BRAND_FIELD_ID}
            name="brand"
            type="text"
            autoComplete="organization"
            required
            maxLength={120}
            disabled={submitting}
            placeholder={t('pages.sponsors.form.brandPlaceholder')}
          />
        </label>

        <label className="sponsor-form__field">
          <span>{t('pages.sponsors.form.name')}</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            disabled={submitting}
            placeholder={t('pages.sponsors.form.namePlaceholder')}
          />
        </label>

        <label className="sponsor-form__field">
          <span>{t('pages.sponsors.form.email')}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={submitting}
          />
        </label>

        <fieldset className="sponsor-form__scope sponsor-form__field--wide" disabled={submitting}>
          <legend>{t('pages.sponsors.form.scopeLabel')}</legend>
          <div className="sponsor-form__scope-options">
            {SPONSOR_SCOPES.map((key) => (
              <label key={key} className="sponsor-form__scope-option">
                <input
                  type="radio"
                  name="scope"
                  value={key}
                  checked={scope === key}
                  onChange={() => setScope(key)}
                />
                <span>{t(`pages.sponsors.form.scope.${key}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="sponsor-form__field sponsor-form__field--wide">
          <span>{t('pages.sponsors.form.tierLabel')}</span>
          <select
            name="tier"
            value={normalizeSponsorTier(tier)}
            disabled={submitting}
            onChange={(event) => onTierChange?.(event.target.value)}
          >
            <option value={SPONSOR_TIER_UNDECIDED}>{t('pages.sponsors.form.tierUndecided')}</option>
            {SPONSOR_TIERS.map((key) => (
              <option key={key} value={key}>
                {t(`pages.sponsors.tiers.${key}.title`)}
              </option>
            ))}
          </select>
        </label>

        <label className="sponsor-form__field sponsor-form__field--wide">
          <span>{t('pages.sponsors.form.contribution')}</span>
          <textarea
            name="contribution"
            rows={3}
            maxLength={2000}
            disabled={submitting}
            placeholder={t('pages.sponsors.form.contributionPlaceholder')}
          />
        </label>
      </div>

      <div className="sponsor-form__actions">
        <button type="submit" className="sponsor-form__submit" disabled={submitting}>
          <span>
            {submitting ? t('pages.sponsors.form.submitting') : t('pages.sponsors.form.submit')}
          </span>
          {submitting ? (
            <span className="plu-spinner" aria-hidden />
          ) : (
            <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
          )}
        </button>
        <a className="sponsor-form__mail" href={mailHref}>
          <Mail size={14} aria-hidden />
          <span>{t('pages.sponsors.form.mailAlt')}</span>
        </a>
        <p className="sponsor-form__note">{t('pages.sponsors.form.note')}</p>
        {status === 'error' ? (
          <p className="sponsor-form__error" role="alert">
            <strong>{t('pages.sponsors.form.errorTitle')}</strong>{' '}
            {t('pages.sponsors.form.errorDesc', { email: CONTACT_EMAIL })}
          </p>
        ) : null}
      </div>
    </form>
  )
}
