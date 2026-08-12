import { useEffect, useId, useMemo, useState } from 'react'
import { Bell, Check, Share2 } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import { getCountdownParts } from '../../lib/countdown.js'
import {
  formatRegistrationOpenMoment,
  isPaidCheckoutOpen,
  resolveLaunchOpenAt,
} from '../../lib/registrationSchedule.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import MaskReveal from '../../motion/MaskReveal.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from '../../motion/tokens.ts'
import { registerLaunchInterest } from '../../services/launchInterestService.js'
import '../../styles/components/launch-registration-teaser.css'

function resolveEventLabel(event) {
  const title = String(event?.title ?? '').trim()
  if (!title) return null
  if (/^(test|demo|prueba|sample|tmp)\b/i.test(title)) return null
  if (title.length < 4) return null
  return title
}

function CountdownDigits({ value, reducedMotion }) {
  const digits = String(value).padStart(2, '0').split('')

  if (reducedMotion) {
    return <span className="launch-teaser__digit-row">{digits.join('')}</span>
  }

  return (
    <span className="launch-teaser__digit-row">
      {digits.map((digit, index) => (
        <span key={`slot-${index}`} className="launch-teaser__digit-slot">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={digit}
              className="launch-teaser__digit"
              initial={{ opacity: 0, y: '55%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '-55%' }}
              transition={{
                duration: MOTION_DURATION.fast,
                ease: MOTION_EASE.out,
                delay: index * 0.02,
              }}
            >
              {digit}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

/**
 * Bloque de apertura de cobros/inscripciones: countdown tipográfico + captura de email.
 * Composición editorial de inauguración; sin cards.
 * Fuente de verdad del countdown: `event.registrationOpensAt` (admin).
 */
export default function LaunchRegistrationTeaser({
  event,
  targetDate,
  onNavigate,
  className = '',
  variant = 'full', // 'full' | 'hero' | 'compact'
  source = 'launch_teaser',
  // Contexto anfitrión (ej. Members #planes) ya tiene su propio encabezado de
  // sección: permite reemplazar badge/título/lead por un mensaje único y evitar
  // que el teaser repita "apertura oficial + nombre del evento" de forma redundante.
  intro,
  // Reemplaza el bloque "próximamente" del countdown por un mensaje corto (+ precio opcional).
  // Preferir countdown real (targetDate / registrationOpensAt) antes que stage.price.
  stage,
  // Override del label del ticker (“Apertura en” → copy de campaña).
  countdownLabel,
  // Numerado editorial del dossier anfitrión (ej. "01" en Pitbull #inscripcion),
  // mismo lenguaje que `pitbull-dossier__index` — hilo conductor con el resto de la página.
  indexLabel,
  // Pitbull: conversión sin ruido de redes; Home puede seguir ofreciendo share.
  hideShare = false,
}) {
  const { t, locale } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const emailInputId = useId()

  const openAt = useMemo(
    () => resolveLaunchOpenAt({ targetDate, event }),
    [targetDate, event],
  )

  const [countdown, setCountdown] = useState(() => (
    openAt ? getCountdownParts(openAt) : { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  ))
  const [email, setEmail] = useState('')
  const [isNotified, setIsNotified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [copied, setCopied] = useState(false)
  // Formulario visible de entrada: el aviso es la acción principal de soft-launch.
  const [showForm, setShowForm] = useState(true)

  useEffect(() => {
    const storageKey = `plu_notify_${event?.slug || 'launch'}`
    try {
      if (localStorage.getItem(storageKey)) setIsNotified(true)
    } catch {
      // Ignorar si localStorage está bloqueado
    }
  }, [event?.slug])

  useEffect(() => {
    if (!openAt) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })
      return undefined
    }

    setCountdown(getCountdownParts(openAt))
    const timer = window.setInterval(() => {
      setCountdown(getCountdownParts(openAt))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [openAt])

  async function handleNotifySubmit(e) {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setIsSubmitting(true)
    setSubmitError('')

    try {
      await registerLaunchInterest({
        email,
        source,
        eventSlug: event?.slug ?? null,
      })
      setIsNotified(true)
      setShowForm(false)
      try {
        localStorage.setItem(`plu_notify_${event?.slug || 'launch'}`, email)
      } catch {
        // Ignorar si localStorage está bloqueado
      }
    } catch (error) {
      setSubmitError(error?.message || t('launchTeaser.modalError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleShare() {
    const shareData = {
      title: 'PLU ARG — Apertura de inscripciones',
      text: t('launchTeaser.shareText'),
      url: window.location.href,
    }

    if (navigator.share) {
      navigator.share(shareData).catch(() => {})
      return
    }

    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2400)
  }

  const units = [
    { value: countdown.days, label: t('launchTeaser.days') },
    { value: countdown.hours, label: t('launchTeaser.hours') },
    { value: countdown.minutes, label: t('launchTeaser.minutes') },
    { value: countdown.seconds, label: t('launchTeaser.seconds') },
  ]

  const ContainerTag = reducedMotion ? 'div' : m.div
  const ItemTag = reducedMotion ? 'div' : m.div
  const RuleTag = reducedMotion ? 'div' : m.div
  const isCompact = variant === 'compact'
  const isHero = variant === 'hero'
  const isDossier = /\blaunch-teaser--dossier\b/.test(className)
  const paidCheckoutOpen = isPaidCheckoutOpen(event, env)
  const eventLabel = resolveEventLabel(event)
  const showAccountCta = !paidCheckoutOpen && typeof onNavigate === 'function'
  const secondaryCta = showAccountCta
    ? { label: t('launchTeaser.createAccountCta'), onClick: () => onNavigate('register') }
    : onNavigate
      ? { label: t('launchTeaser.membersCta'), onClick: () => onNavigate('members') }
      : null

  const openMoment = openAt ? formatRegistrationOpenMoment(openAt, locale) : null
  const showTicker = Boolean(openAt) && !countdown.expired
  // Fecha pasada + cobros aún cerrados (kill switch): no mostrar el “opens on” vencido.
  const scheduleHeld = Boolean(openAt) && countdown.expired && !paidCheckoutOpen
  const inauguration = !paidCheckoutOpen
  const showOpenMoment = Boolean(openMoment) && showTicker
  // Dossier (Pitbull): sin ticker el lead del intro ya comunica el estado;
  // no apilar un segundo bloque "próximamente / inauguración".
  const showCountdownBlock = showTicker || !(isDossier && intro)
  const statusLabel = showTicker
    ? (countdownLabel || t('launchTeaser.countdownTitle'))
    : scheduleHeld
      ? t('launchTeaser.countdownHeldTitle')
      : t('launchTeaser.countdownPendingTitle')
  const statusCopy = showTicker
    ? null
    : scheduleHeld
      ? t('launchTeaser.countdownHeld')
      : t('launchTeaser.countdownPending')
  const countdownAria = showTicker
    ? t('launchTeaser.countdownAria', {
      days: countdown.days,
      hours: countdown.hours,
      minutes: countdown.minutes,
      seconds: countdown.seconds,
    })
    : scheduleHeld
      ? t('launchTeaser.countdownHeldAria')
      : t('launchTeaser.countdownPendingAria')
  // Precio estático en stage: solo si no hay ticker (el countdown gana siempre).
  const showStagePrice = Boolean(stage?.price) && !showTicker

  const childVariants = reducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: isHero ? 18 : 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: isHero ? MOTION_DURATION.cinematic : MOTION_DURATION.slow,
            ease: MOTION_EASE.cinematic ?? MOTION_EASE.out,
          },
        },
      }

  // Hero (Home) reusa la firma cinemática de HeroSection.jsx (mismo .motif-rule,
  // misma duración/ease) para que la cortina de apertura se sienta continuación
  // del hero principal, no un componente nuevo.
  const ruleVariants = reducedMotion
    ? undefined
    : {
        hidden: { scaleX: 0, opacity: isHero ? 1 : 0.4 },
        show: {
          scaleX: 1,
          opacity: 1,
          transition: {
            duration: isHero ? MOTION_DURATION.cinematic : MOTION_DURATION.slow,
            ease: isHero ? MOTION_EASE.cinematic : MOTION_EASE.out,
          },
        },
      }

  return (
    <ContainerTag
      className={[
        'launch-teaser',
        `launch-teaser--${variant}`,
        inauguration ? 'launch-teaser--inauguration' : '',
        showTicker ? 'launch-teaser--live-clock' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...(reducedMotion
        ? {}
        : {
            initial: 'hidden',
            whileInView: 'show',
            viewport: { once: true, amount: 0.22 },
            variants: {
              hidden: {},
              show: {
                transition: {
                  staggerChildren: isCompact
                    ? MOTION_STAGGER.stepFast
                    : isHero
                      ? 0.1
                      : MOTION_STAGGER.step,
                  delayChildren: isHero ? 0.12 : MOTION_STAGGER.delayChildren,
                },
              },
            },
          })}
    >
      <span className="launch-teaser__atmosphere" aria-hidden />
      {isHero ? <span className="launch-teaser__plate motif-plate" aria-hidden /> : null}

      <RuleTag
        className={`launch-teaser__rule${isHero ? ' motif-rule' : ''}`}
        aria-hidden
        style={{ transformOrigin: 'left center' }}
        variants={ruleVariants}
      />

      <div className="launch-teaser__layout">
        <ItemTag className="launch-teaser__copy" variants={childVariants}>
          <p className="launch-teaser__eyebrow">
            {indexLabel ? (
              <span className="launch-teaser__index-group" aria-hidden>
                <span className="launch-teaser__index">{indexLabel}</span>
                <span className="launch-teaser__index-sep" />
              </span>
            ) : (
              <span className="launch-teaser__live" aria-hidden />
            )}
            <span>{intro?.eyebrow ?? t('launchTeaser.badge')}</span>
          </p>

          {intro ? (
            <h2 className="launch-teaser__title launch-teaser__title--sentence">
              {intro.title}
            </h2>
          ) : (
            <>
              {eventLabel && !indexLabel ? (
                <p className="launch-teaser__event">{eventLabel}</p>
              ) : null}

              <h2 className="launch-teaser__title">
                {reducedMotion ? (
                  <>
                    <span className="launch-teaser__title-line">{t('launchTeaser.headlineLine1')}</span>
                    <span className="launch-teaser__title-line launch-teaser__title-line--accent">
                      {t('launchTeaser.headlineLine2')}
                    </span>
                  </>
                ) : (
                  <>
                    <MaskReveal className="launch-teaser__title-mask" delay={40}>
                      <span className="launch-teaser__title-line">{t('launchTeaser.headlineLine1')}</span>
                    </MaskReveal>
                    <MaskReveal className="launch-teaser__title-mask" delay={110}>
                      <span className="launch-teaser__title-line launch-teaser__title-line--accent">
                        {t('launchTeaser.headlineLine2')}
                      </span>
                    </MaskReveal>
                  </>
                )}
              </h2>
            </>
          )}

          <p className="launch-teaser__lead">
            {intro?.lead ?? (isCompact ? t('launchTeaser.leadCompact') : t('launchTeaser.lead'))}
          </p>
        </ItemTag>

        {showCountdownBlock ? (
          <ItemTag
            className="launch-teaser__countdown"
            role="timer"
            aria-live="polite"
            aria-atomic="true"
            aria-label={countdownAria}
            variants={childVariants}
          >
            {showTicker ? (
              <>
                <p className="launch-teaser__countdown-label">{statusLabel}</p>
                <div className="launch-teaser__ticker">
                  {units.map(({ value, label }, index) => (
                    <div key={label} className="launch-teaser__unit">
                      {index > 0 ? (
                        <span className="launch-teaser__sep" aria-hidden>
                          :
                        </span>
                      ) : null}
                      <div className="launch-teaser__unit-body">
                        <span className="launch-teaser__value" aria-hidden>
                          <CountdownDigits value={value} reducedMotion={reducedMotion} />
                        </span>
                        <span className="launch-teaser__unit-label">{label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {showOpenMoment ? (
                  <p className="launch-teaser__when">
                    {t('launchTeaser.opensOn', { date: openMoment.day, time: openMoment.time })}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="launch-teaser__stage">
                {showStagePrice ? (
                  <>
                    <p className="launch-teaser__stage-mark">
                      <span className="launch-teaser__stage-mark-text">
                        {stage?.mark ?? t('launchTeaser.stageMark')}
                      </span>
                    </p>
                    <p className="launch-teaser__stage-price">{stage.price}</p>
                  </>
                ) : (
                  <p className="launch-teaser__pending">{stage?.mark ?? statusCopy}</p>
                )}
              </div>
            )}
          </ItemTag>
        ) : null}

        <ItemTag className="launch-teaser__actions" variants={childVariants}>
          <AnimatePresence mode="wait" initial={false}>
            {isNotified ? (
              <m.p
                key="confirmed"
                className="launch-teaser__confirmed"
                role="status"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
              >
                <Check size={16} aria-hidden />
                <span>
                  <strong>{t('launchTeaser.modalSuccessTitle')}</strong>
                  <span className="launch-teaser__confirmed-desc">
                    {t('launchTeaser.modalSuccessDesc')}
                  </span>
                </span>
              </m.p>
            ) : showForm ? (
              <m.form
                key="form"
                className="launch-teaser__form"
                onSubmit={handleNotifySubmit}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
              >
                <label htmlFor={emailInputId} className="launch-teaser__sr-only">
                  Email
                </label>
                <input
                  id={emailInputId}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t('launchTeaser.modalEmailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="launch-teaser__input"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="launch-teaser__cta launch-teaser__cta--primary"
                >
                  {isSubmitting ? t('launchTeaser.modalSubmitting') : t('launchTeaser.modalSubmit')}
                </button>
              </m.form>
            ) : (
              <m.button
                key="notify"
                type="button"
                className="launch-teaser__cta launch-teaser__cta--primary"
                onClick={() => setShowForm(true)}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
              >
                <Bell size={15} aria-hidden />
                <span>{t('launchTeaser.notifyCta')}</span>
              </m.button>
            )}
          </AnimatePresence>

          {submitError ? (
            <p className="launch-teaser__error" role="alert">{submitError}</p>
          ) : null}

          {!isNotified ? (
            <p className="launch-teaser__notify-hint">{t('launchTeaser.notifyHint')}</p>
          ) : null}

          <div className="launch-teaser__secondary">
            {secondaryCta ? (
              <button
                type="button"
                className="launch-teaser__link"
                onClick={secondaryCta.onClick}
              >
                {secondaryCta.label}
              </button>
            ) : null}

            {!isCompact && !hideShare ? (
              <>
                {secondaryCta ? <span className="launch-teaser__dot" aria-hidden>·</span> : null}
                <button
                  type="button"
                  className="launch-teaser__link launch-teaser__link--quiet"
                  onClick={handleShare}
                >
                  <Share2 size={13} aria-hidden />
                  <span>{copied ? t('launchTeaser.copied') : t('launchTeaser.shareCta')}</span>
                </button>
              </>
            ) : null}
          </div>
        </ItemTag>
      </div>
    </ContainerTag>
  )
}
