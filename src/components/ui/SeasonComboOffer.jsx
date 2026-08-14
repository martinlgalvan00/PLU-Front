import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resolveComboDeal } from '../../lib/eventPricing.js'
import { formatPromoDeadline, money } from '../../lib/format.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import '../../styles/components/season-combo-offer.css'

const OFFER_GROUP = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: MOTION_STAGGER.delayChildren,
      staggerChildren: MOTION_STAGGER.step,
    },
  },
}

const OFFER_ITEM = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.reveal, ease: MOTION_EASE.out },
  },
}

/** El sello −20% es el gancho: entra con un overshoot corto, una sola vez. */
const OFFER_MARK = {
  hidden: { opacity: 0, y: 14, scale: 0.88 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.spring },
  },
}

const OFFER_RULE = {
  hidden: { opacity: 0, scaleX: 0 },
  visible: {
    opacity: 0.45,
    scaleX: 1,
    transition: { delay: 0.14, duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const OFFER_AMOUNT = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
  },
}

/**
 * Oferta comercial de la promo afiliación + inscripción.
 * El precio conjunto es el dato protagonista; el ledger queda subordinado.
 * No cobra ni confirma.
 */
export default function SeasonComboOffer({
  variant = 'band',
  membershipPrice,
  registrationPrice,
  comboPrice,
  endsAt,
  ctaLabel,
  ctaDisabled = false,
  onCta,
  secondaryCtaLabel,
  secondaryCtaDisabled = false,
  onSecondaryCta,
  className = '',
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const headingId = useId()
  const deal = resolveComboDeal({
    membership: membershipPrice,
    registration: registrationPrice,
    combo: comboPrice,
  })
  if (!deal.live) return null

  const deadline = endsAt ? formatPromoDeadline(endsAt, locale) : ''
  const until = deadline ? t('comboDeal.until', { date: deadline }) : ''
  const showActions = variant === 'band' && typeof onCta === 'function'
  const showSecondary = showActions && typeof onSecondaryCta === 'function' && secondaryCtaLabel
  const percentLabel = t('comboDeal.percent', { percent: deal.percent })
  // En compact el bloque vive dentro de un label/radio: un resumen corto evita
  // que el nombre accesible se convierta en el ledger completo.
  const compactLabel = t('comboDeal.summary', {
    percent: deal.percent,
    amount: money(deal.combo, locale),
  })

  const animate = !reducedMotion
  const rootTag = variant === 'band' ? 'aside' : 'div'
  const Root = animate ? m[rootTag] : rootTag
  const Mark = animate ? m.p : 'p'
  const Rule = animate ? m.span : 'span'
  const Title = animate ? m.h3 : 'h3'
  const Amount = animate ? m.strong : 'strong'
  const Compare = animate ? m.s : 's'
  const Row = animate ? m.div : 'div'
  const Until = animate ? m.p : 'p'
  const Actions = animate ? m.div : 'div'
  const groupProps = animate
    ? {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
        variants: OFFER_GROUP,
      }
    : {}
  const item = animate ? { variants: OFFER_ITEM } : {}

  return (
    <Root
      className={['season-combo-offer', `season-combo-offer--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={variant === 'compact' ? compactLabel : undefined}
      aria-labelledby={variant === 'compact' ? undefined : headingId}
      {...groupProps}
    >
      <div className="season-combo-offer__stage">
        <div className="season-combo-offer__hero">
          {deal.percent > 0 ? (
            <Mark
              className="season-combo-offer__mark"
              aria-label={percentLabel}
              {...(animate ? { variants: OFFER_MARK } : {})}
            >
              <span className="season-combo-offer__mark-value" aria-hidden>
                {t('comboDeal.percentMark', { percent: deal.percent })}
              </span>
              <span className="season-combo-offer__mark-copy">{percentLabel}</span>
              <Rule
                className="season-combo-offer__mark-rule"
                aria-hidden
                {...(animate ? { variants: OFFER_RULE } : {})}
              />
            </Mark>
          ) : (
            <p className="season-combo-offer__eyebrow">{t('comboDeal.eyebrow')}</p>
          )}
          {variant === 'compact' ? null : (
            <Title className="season-combo-offer__title" id={headingId} {...item}>
              {t('comboDeal.title')}
            </Title>
          )}
          <p className="season-combo-offer__price">
            <Amount
              className="season-combo-offer__amount"
              {...(animate ? { variants: OFFER_AMOUNT } : {})}
            >
              {money(deal.combo, locale)}
            </Amount>
            <Compare className="season-combo-offer__compare" {...item}>
              {t('comboDeal.compare', { amount: money(deal.separate, locale) })}
            </Compare>
          </p>
        </div>

        <dl className="season-combo-offer__ledger">
          <Row className="season-combo-offer__row" {...item}>
            <dt>{t('comboDeal.membership')}</dt>
            <dd>{money(deal.membership, locale)}</dd>
          </Row>
          <Row className="season-combo-offer__row" {...item}>
            <dt>{t('comboDeal.registration')}</dt>
            <dd>{money(deal.registration, locale)}</dd>
          </Row>
        </dl>
      </div>

      {until ? (
        <Until className="season-combo-offer__until" {...item}>
          {until}
        </Until>
      ) : null}

      {showActions ? (
        <Actions className="season-combo-offer__actions" {...item}>
          <button
            type="button"
            className="btn btn--gold season-combo-offer__cta"
            disabled={ctaDisabled}
            onClick={onCta}
          >
            {ctaLabel || t('comboDeal.cta')}
            <ArrowRight size={15} aria-hidden className="season-combo-offer__cta-icon" />
          </button>
          {showSecondary ? (
            <button
              type="button"
              className="season-combo-offer__cta-secondary"
              disabled={secondaryCtaDisabled}
              onClick={onSecondaryCta}
            >
              {secondaryCtaLabel}
            </button>
          ) : null}
        </Actions>
      ) : null}
    </Root>
  )
}
