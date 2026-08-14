import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { usePaymentModal } from '../checkout/usePaymentModal.js'

const STEPS = [
  { titleKey: 'homeGuide.step1Title', bodyKey: 'homeGuide.step1Body' },
  { titleKey: 'homeGuide.step2Title', bodyKey: 'homeGuide.step2Body' },
  { titleKey: 'homeGuide.step3Title', bodyKey: 'homeGuide.step3Body' },
]

export default function HomeGuideSheet({ onAffiliate, onClose }) {
  const { t } = useI18n()
  const panelRef = usePaymentModal(onClose)

  return (
    <div className="home-guide__overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        aria-labelledby="home-guide-title"
        aria-describedby="home-guide-lead"
        aria-modal="true"
        className="home-guide"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="home-guide__header">
          <div>
            <h2 id="home-guide-title">{t('homeGuide.title')}</h2>
            <p id="home-guide-lead" className="home-guide__lead">{t('homeGuide.lead')}</p>
          </div>
          <button
            type="button"
            className="home-guide__close"
            onClick={onClose}
            aria-label={t('homeGuide.closeAria')}
          >
            <X size={18} />
          </button>
        </header>

        <ol className="home-guide__steps">
          {STEPS.map((step, index) => (
            <li key={step.titleKey} className="home-guide__step">
              <span className="home-guide__index" aria-hidden>{index + 1}</span>
              <div>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.bodyKey)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="home-guide__actions">
          <button type="button" className="home-guide__cta" onClick={onAffiliate}>
            {t('homeGuide.cta')}
          </button>
          <button type="button" className="home-guide__skip" onClick={onClose}>
            {t('homeGuide.close')}
          </button>
        </div>
      </section>
    </div>
  )
}
