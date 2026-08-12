import { useEffect, useId, useState } from 'react'
import { Bell, Check, Clock, Flame, QrCode, Share2, Sparkles, X } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getCountdownParts } from '../../lib/countdown.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import '../../styles/components/launch-registration-teaser.css'

/**
 * Componente de intriga, marketing y cuenta regresiva de lanzamiento.
 * Se muestra cuando las inscripciones están deshabilitadas / próximamente.
 */
export default function LaunchRegistrationTeaser({
  event,
  targetDate,
  onNavigate,
  className = '',
  variant = 'full', // 'full' | 'hero' | 'compact'
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const emailInputId = useId()

  const defaultEnd = event?.registrationOpensAt
    ? event.registrationOpensAt
    : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const endDate = targetDate || defaultEnd

  const [countdown, setCountdown] = useState(() => getCountdownParts(endDate))
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isNotified, setIsNotified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getCountdownParts(endDate))
    }, 1000)
    return () => clearInterval(timer)
  }, [endDate])

  function handleNotifySubmit(e) {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setIsSubmitting(true)

    // Simular registro de interés instantáneo
    setTimeout(() => {
      setIsSubmitting(false)
      setIsNotified(true)
      try {
        localStorage.setItem(`plu_notify_${event?.slug || 'launch'}`, email)
      } catch (_err) {
        // Ignorar si localStorage está bloqueado
      }
    }, 400)
  }

  function handleShare() {
    const shareData = {
      title: 'PLU ARG — Lanzamiento Oficial e Inscripciones',
      text: '¡Las inscripciones a los eventos oficiales de PLU Argentina están por abrir! Mirá la cuenta regresiva en vivo.',
      url: window.location.href,
    }

    if (navigator.share) {
      navigator.share(shareData).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    }
  }

  const units = [
    { value: countdown.days, label: t('launchTeaser.days') },
    { value: countdown.hours, label: t('launchTeaser.hours') },
    { value: countdown.minutes, label: t('launchTeaser.minutes') },
    { value: countdown.seconds, label: t('launchTeaser.seconds') },
  ]

  const ContainerTag = reducedMotion ? 'div' : m.div
  const isCompact = variant === 'compact'

  return (
    <ContainerTag
      className={`launch-teaser launch-teaser--${variant} ${className}`.trim()}
      {...(reducedMotion
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, amount: 0.2 },
            transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          })}
    >
      <div className="launch-teaser__ambient" aria-hidden />

      <div className="launch-teaser__inner">
        {/* Cabecera / Badge de Intriga */}
        <header className="launch-teaser__head">
          <div className="launch-teaser__badge">
            <span className="launch-teaser__beacon" aria-hidden />
            <span className="launch-teaser__badge-text">{t('launchTeaser.badge')}</span>
          </div>

          <h2 className="launch-teaser__title">
            {event?.title ? `${event.title} · ${t('launchTeaser.badgeSub')}` : t('launchTeaser.title')}
          </h2>

          <p className="launch-teaser__lead">{t('launchTeaser.lead')}</p>
        </header>

        {/* Ticker de Cuenta Regresiva de Precisión (Días, Horas, Minutos, Segundos) */}
        <div className="launch-teaser__countdown-shell">
          <p className="launch-teaser__countdown-title">
            <Clock size={15} aria-hidden />
            <span>{t('launchTeaser.countdownTitle')}</span>
          </p>

          <div className="launch-teaser__ticker" aria-live="polite">
            {units.map(({ value, label }) => (
              <div key={label} className="launch-teaser__ticker-unit">
                <div className="launch-teaser__ticker-box">
                  <span className="launch-teaser__ticker-val">{String(value).padStart(2, '0')}</span>
                </div>
                <span className="launch-teaser__ticker-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Botones de Acción de Marketing */}
        <div className="launch-teaser__actions">
          <button
            type="button"
            className="launch-teaser__cta launch-teaser__cta--primary motion-icon-shift"
            onClick={() => setIsModalOpen(true)}
          >
            <Bell size={16} aria-hidden />
            <span>{isNotified ? t('launchTeaser.modalSuccessTitle') : t('launchTeaser.notifyCta')}</span>
          </button>

          <button
            type="button"
            className="launch-teaser__cta launch-teaser__cta--secondary"
            onClick={handleShare}
          >
            {copied ? (
              <>
                <Check size={16} className="color-success" aria-hidden />
                <span>¡Enlace copiado!</span>
              </>
            ) : (
              <>
                <Share2 size={16} aria-hidden />
                <span>{t('launchTeaser.shareCta')}</span>
              </>
            )}
          </button>

          {onNavigate ? (
            <button
              type="button"
              className="launch-teaser__cta launch-teaser__cta--ghost"
              onClick={() => onNavigate('members')}
            >
              Conocer afiliación previa →
            </button>
          ) : null}
        </div>

        {/* Tarjetas de Beneficios & Intriga */}
        {!isCompact ? (
          <div className="launch-teaser__perks">
            <p className="launch-teaser__perks-title">{t('launchTeaser.perksTitle')}</p>
            <div className="launch-teaser__perks-grid">
              <div className="launch-teaser__perk-card">
                <div className="launch-teaser__perk-icon">
                  <Flame size={20} />
                </div>
                <div className="launch-teaser__perk-info">
                  <h4>{t('launchTeaser.perk1Title')}</h4>
                  <p>{t('launchTeaser.perk1Desc')}</p>
                </div>
              </div>

              <div className="launch-teaser__perk-card">
                <div className="launch-teaser__perk-icon">
                  <Sparkles size={20} />
                </div>
                <div className="launch-teaser__perk-info">
                  <h4>{t('launchTeaser.perk2Title')}</h4>
                  <p>{t('launchTeaser.perk2Desc')}</p>
                </div>
              </div>

              <div className="launch-teaser__perk-card">
                <div className="launch-teaser__perk-icon">
                  <QrCode size={20} />
                </div>
                <div className="launch-teaser__perk-info">
                  <h4>{t('launchTeaser.perk3Title')}</h4>
                  <p>{t('launchTeaser.perk3Desc')}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal de Pre-registro / Notificación de Apertura */}
      {isModalOpen ? (
        <div
          className="launch-teaser-modal__backdrop"
          role="presentation"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="launch-teaser-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="launch-teaser-modal__close"
              aria-label="Cerrar"
              onClick={() => setIsModalOpen(false)}
            >
              <X size={18} />
            </button>

            {!isNotified ? (
              <>
                <div className="launch-teaser-modal__icon">
                  <Bell size={24} />
                </div>

                <h3 id="launch-modal-title" className="launch-teaser-modal__title">
                  {t('launchTeaser.modalTitle')}
                </h3>

                <p className="launch-teaser-modal__lead">{t('launchTeaser.modalLead')}</p>

                <form onSubmit={handleNotifySubmit} className="launch-teaser-modal__form">
                  <div className="launch-teaser-modal__field">
                    <label htmlFor={emailInputId} className="sr-only">
                      Email
                    </label>
                    <input
                      id={emailInputId}
                      type="email"
                      required
                      placeholder={t('launchTeaser.modalEmailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="launch-teaser-modal__input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="launch-teaser-modal__submit"
                  >
                    {isSubmitting ? 'Registrando…' : t('launchTeaser.modalSubmit')}
                  </button>
                </form>
              </>
            ) : (
              <div className="launch-teaser-modal__success">
                <div className="launch-teaser-modal__success-icon">
                  <Check size={28} />
                </div>
                <h3>{t('launchTeaser.modalSuccessTitle')}</h3>
                <p>{t('launchTeaser.modalSuccessDesc')}</p>
                <button
                  type="button"
                  className="launch-teaser-modal__submit"
                  onClick={() => setIsModalOpen(false)}
                >
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </ContainerTag>
  )
}
