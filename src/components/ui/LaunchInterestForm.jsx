import { useId, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import { registerLaunchInterest } from '../../services/launchInterestService.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Aviso de lanzamiento por correo. El texto vive en `pages.shop.interest` para
 * que la misma pieza sirva en el hero, el cajón de evento y los "Próximamente"
 * de la tienda sin duplicar copy.
 */
export default function LaunchInterestForm({ source, eventSlug }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const inputId = useId()
  const errorId = useId()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle, loading, success, error, invalid

  async function handleSubmit(e) {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_PATTERN.test(value)) {
      setStatus('invalid')
      return
    }
    setStatus('loading')
    try {
      await registerLaunchInterest({ email: value, source, eventSlug })
      setStatus('success')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  const Panel = still ? 'div' : m.div
  const enter = still
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
      }

  if (status === 'success') {
    return (
      <Panel className="shop-interest-form shop-interest-form--success" role="status" {...enter}>
        <svg className="shop-interest-form__seal" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10.5" />
          <path d="M7.5 12.5l3 3 6-6.5" />
        </svg>
        <span>{t('pages.shop.catalog.interest.success')}</span>
      </Panel>
    )
  }

  const hasError = status === 'error' || status === 'invalid'

  return (
    <form className="shop-interest-form" onSubmit={handleSubmit} noValidate>
      <label className="shop-interest-form__label" htmlFor={inputId}>
        {t('pages.shop.catalog.interest.label')}
      </label>
      <div className="shop-interest-form__row">
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t('pages.shop.catalog.interest.placeholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (hasError) setStatus('idle')
          }}
          required
          disabled={status === 'loading'}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
        />
        <button type="submit" disabled={status === 'loading'}>
          <span>
            {status === 'loading'
              ? t('pages.shop.catalog.interest.sending')
              : t('pages.shop.catalog.interest.cta')}
          </span>
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {hasError ? (
          <Panel
            key={status}
            id={errorId}
            className="shop-interest-form__error"
            role="alert"
            {...enter}
          >
            {status === 'invalid'
              ? t('pages.shop.catalog.interest.invalid')
              : t('pages.shop.catalog.interest.error')}
          </Panel>
        ) : null}
      </AnimatePresence>
    </form>
  )
}
