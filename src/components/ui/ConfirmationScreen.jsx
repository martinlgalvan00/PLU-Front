import { CheckCircle2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CTAButton from './CTAButton.jsx'

export default function ConfirmationScreen({
  title,
  subtitle,
  steps = [],
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}) {
  const { t } = useI18n()

  return (
    <section className="confirmation-screen surface-card">
      <CheckCircle2 size={40} className="confirmation-screen__icon" />
      <h2>{title ?? t('confirmation.title')}</h2>
      <p>{subtitle ?? t('confirmation.subtitle')}</p>
      {steps.length > 0 && (
        <div className="confirmation-screen__steps">
          <h3>{t('confirmation.nextSteps')}</h3>
          <ol>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="confirmation-screen__actions">
        {onPrimary && (
          <CTAButton onClick={onPrimary}>{primaryLabel ?? t('confirmation.viewPanel')}</CTAButton>
        )}
        {onSecondary && (
          <CTAButton variant="outline" onClick={onSecondary}>
            {secondaryLabel ?? t('confirmation.backHome')}
          </CTAButton>
        )}
      </div>
    </section>
  )
}
