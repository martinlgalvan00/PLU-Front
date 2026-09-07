import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { CONTACT_EMAIL } from '../../lib/contact.js'
import { submitContactMessage } from '../../services/contactService.js'

const MOTIVES = ['atleta', 'gimnasio', 'organizacion', 'pluusa']

export default function ContactForm() {
  const { t } = useI18n()
  const [motive, setMotive] = useState('atleta')
  const [status, setStatus] = useState('idle') // idle | submitting | sent | error

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'submitting') return
    const data = new FormData(event.currentTarget)
    setStatus('submitting')
    try {
      await submitContactMessage({
        name: data.get('name')?.toString().trim() ?? '',
        email: data.get('email')?.toString().trim() ?? '',
        message: data.get('message')?.toString().trim() ?? '',
        motive,
      })
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="contact-success" role="status" aria-live="polite">
        <div className="contact-success__icon" aria-hidden>
          <Check size={18} strokeWidth={2.5} />
        </div>
        <h2>{t('contact.sentTitle')}</h2>
        <p>{t('contact.sentDesc')}</p>
      </div>
    )
  }

  return (
    <form className="contact-form" aria-labelledby="contact-form-title" onSubmit={handleSubmit}>
      <header className="contact-form__intro">
        <p className="contact-form__intro-eyebrow">{t('contact.formEyebrow')}</p>
        <h2 id="contact-form-title">{t('contact.formTitle')}</h2>
        <p>{t('contact.formDesc')}</p>
      </header>

      <section className="contact-form__section" aria-labelledby="contact-motive-label">
        <header className="contact-form__section-head">
          <span className="contact-form__index" aria-hidden>
            01
          </span>
          <p className="contact-form__label" id="contact-motive-label">
            {t('contact.motiveLabel')}
          </p>
        </header>

        <div
          className="contact-form__motives"
          role="radiogroup"
          aria-labelledby="contact-motive-label"
        >
          {MOTIVES.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={motive === key}
              className={`contact-form__motive${motive === key ? ' is-active' : ''}`}
              disabled={status === 'submitting'}
              onClick={() => setMotive(key)}
            >
              <span className="contact-form__motive-label">{t(`contact.motive.${key}`)}</span>
            </button>
          ))}
        </div>
        <p className="contact-form__motive-hint" aria-live="polite">
          {t(`contact.motiveHint.${motive}`)}
        </p>
      </section>

      <section className="contact-form__section" aria-labelledby="contact-fields-label">
        <header className="contact-form__section-head">
          <span className="contact-form__index" aria-hidden>
            02
          </span>
          <p className="contact-form__label" id="contact-fields-label">
            {t('contact.fieldsLabel')}
          </p>
        </header>

        <div className="contact-form__fields">
          <div className="contact-form__fields-row">
            <label className="contact-form__field">
              <span>{t('contact.name')}</span>
              <input
                autoComplete="name"
                type="text"
                name="name"
                required
                disabled={status === 'submitting'}
                placeholder={t('contact.namePlaceholder')}
              />
            </label>
            <label className="contact-form__field">
              <span>{t('contact.email')}</span>
              <input
                autoComplete="email"
                type="email"
                name="email"
                required
                disabled={status === 'submitting'}
                placeholder="nombre@pluarg.com.ar"
              />
            </label>
          </div>
          <label className="contact-form__field">
            <span>{t('contact.message')}</span>
            <textarea
              name="message"
              rows={4}
              required
              disabled={status === 'submitting'}
              placeholder={t('contact.messagePlaceholder')}
            />
          </label>
        </div>
      </section>

      <input type="hidden" name="motive" value={motive} />

      <div className="contact-form__actions">
        <button
          type="submit"
          className="contact-form__submit"
          disabled={status === 'submitting'}
        >
          <span>{status === 'submitting' ? t('contact.submitting') : t('contact.submit')}</span>
          {status === 'submitting' ? (
            <span className="plu-spinner" aria-hidden />
          ) : (
            <ArrowRight size={15} strokeWidth={1.25} aria-hidden />
          )}
        </button>
        <p className="contact-form__note">{t('contact.submitNote')}</p>
        {status === 'error' ? (
          <p className="contact-form__error" role="alert">
            <strong>{t('contact.errorTitle')}</strong>{' '}
            {t('contact.errorDesc', { email: CONTACT_EMAIL })}
          </p>
        ) : null}
      </div>
    </form>
  )
}
