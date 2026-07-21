import { useState } from 'react'
import { ArrowRight, Building2, CalendarDays, Check, Globe2, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const MOTIVES = ['atleta', 'gimnasio', 'organizacion', 'pluusa']

const MOTIVE_ICONS = {
  atleta: UserRound,
  gimnasio: Building2,
  organizacion: CalendarDays,
  pluusa: Globe2,
}

export default function ContactForm() {
  const { t } = useI18n()
  const [motive, setMotive] = useState('atleta')
  const [sent, setSent] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    setSent(true)
  }

  if (sent) {
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
        <div className="contact-form__intro-topline">
          <span className="contact-form__intro-eyebrow">{t('contact.formEyebrow')}</span>
          <span className="contact-form__intro-rule" aria-hidden />
        </div>
        <h2 id="contact-form-title">{t('contact.formTitle')}</h2>
        <p>{t('contact.formDesc')}</p>
      </header>

      <section className="contact-form__section" aria-labelledby="contact-motive-label">
        <header className="contact-form__section-head">
          <span className="contact-form__index" aria-hidden>
            01
          </span>
          <div className="contact-form__section-copy">
            <p className="contact-form__label" id="contact-motive-label">
              {t('contact.motiveLabel')}
            </p>
            <p className="contact-form__motive-hint">{t(`contact.motiveHint.${motive}`)}</p>
          </div>
        </header>

        <div className="contact-form__motives" role="radiogroup" aria-labelledby="contact-motive-label">
          {MOTIVES.map((key) => {
            const Icon = MOTIVE_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={motive === key}
                className={`contact-form__motive${motive === key ? ' is-active' : ''}`}
                onClick={() => setMotive(key)}
              >
                <span className="contact-form__motive-icon" aria-hidden>
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="contact-form__motive-label">{t(`contact.motive.${key}`)}</span>
              </button>
            )
          })}
        </div>
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
                placeholder="nombre@pluarg.com.ar"
              />
            </label>
          </div>
          <label className="contact-form__field">
            <span>{t('contact.message')}</span>
            <textarea name="message" rows={4} required placeholder={t('contact.messagePlaceholder')} />
          </label>
        </div>
      </section>

      <input type="hidden" name="motive" value={motive} />

      <div className="contact-form__actions">
        <button type="submit" className="contact-form__submit">
          {t('contact.submit')}
          <ArrowRight size={14} aria-hidden />
        </button>
        <p className="contact-form__note">{t('contact.submitNote')}</p>
      </div>
    </form>
  )
}
