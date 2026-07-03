import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const MOTIVES = ['atleta', 'gimnasio', 'organizacion', 'pluusa']

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
      <div className="contact-success">
        <div className="contact-success__icon" aria-hidden>✓</div>
        <h2>{t('contact.sentTitle')}</h2>
        <p>{t('contact.sentDesc')}</p>
      </div>
    )
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <p className="contact-form__label">{t('contact.motiveLabel')}</p>
      <div className="contact-form__pills" role="group" aria-label={t('contact.motiveLabel')}>
        {MOTIVES.map((key) => (
          <button
            key={key}
            type="button"
            className={`contact-form__pill ${motive === key ? 'is-active' : ''}`}
            aria-pressed={motive === key}
            onClick={() => setMotive(key)}
          >
            {t(`contact.motive.${key}`)}
          </button>
        ))}
      </div>

      <div className="contact-form__fields">
        <label className="contact-form__field">
          <span>{t('contact.name')}</span>
          <input type="text" name="name" required placeholder={t('contact.namePlaceholder')} />
        </label>
        <label className="contact-form__field">
          <span>{t('contact.email')}</span>
          <input type="email" name="email" required placeholder="nombre@pluarg.com.ar" />
        </label>
        <label className="contact-form__field">
          <span>{t('contact.message')}</span>
          <textarea name="message" rows={5} required placeholder={t('contact.messagePlaceholder')} />
        </label>
      </div>

      <button type="submit" className="btn contact-form__submit">
        {t('contact.submit')}
      </button>
    </form>
  )
}
