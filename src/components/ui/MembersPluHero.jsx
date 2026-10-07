import { useEffect, useMemo, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { m } from 'motion/react'
import Button from './Button.jsx'
import CredentialCard from './CredentialCard.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import {
  buildCredentialUrl,
  buildRandomPreviewCredentialCode,
  generateCredentialQr,
} from '../../lib/credentialQr.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_STAGGER_BY_TIER } from '../../motion/tokens.ts'
import {
  heroProofItem,
  heroSequenceItem,
  heroTitleLine,
} from '../../motion/variants.ts'

function scrollToId(id) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function MembersPluHero({
  onNavigate,
  session,
  affiliationCta,
  ctaDisabled,
  onAffiliate,
  price,
  pricePeriod,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const { MEMBERSHIP_CREDENTIAL_SAMPLE } = useContent()
  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const [previewCode] = useState(() => buildRandomPreviewCredentialCode())
  const [credentialQrSrc, setCredentialQrSrc] = useState(null)

  // Cascada propia del hero (paridad con Home): escala por tier sin tocar
  // heroStaggerContainer compartido con PluPageHero / Pitbull.
  const heroStagger = useMemo(() => {
    const { step, delayChildren } = MOTION_STAGGER_BY_TIER[tier]
    return {
      hidden: {},
      visible: { transition: { staggerChildren: step, delayChildren } },
    }
  }, [tier])

  useEffect(() => {
    let cancelled = false
    // QR de vista previa (código PREV-*, no verificable) — aleatorio por visita
    // para que al escanear se abra el easter egg de CredentialPage.
    generateCredentialQr(buildCredentialUrl({ code: previewCode }))
      .then((dataUrl) => {
        if (!cancelled) setCredentialQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setCredentialQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [previewCode])

  const hasPrice = Number.isFinite(price)
  const Main = reducedMotion ? 'div' : m.div
  const Chapter = reducedMotion ? 'p' : m.p
  const Title = reducedMotion ? 'h1' : m.h1
  const TitleLine = reducedMotion ? 'span' : m.span
  const Desc = reducedMotion ? 'p' : m.p
  const CtaRow = reducedMotion ? 'div' : m.div
  const Account = reducedMotion ? 'div' : m.div
  const Showcase = reducedMotion ? 'div' : m.div
  const itemProps = reducedMotion ? {} : { variants: heroSequenceItem }
  const titleLineProps = reducedMotion ? {} : { variants: heroTitleLine }
  const mainProps = reducedMotion
    ? {}
    : { initial: 'hidden', animate: 'visible', variants: heroStagger }
  const titleProps = reducedMotion ? {} : { variants: heroStagger }
  const showcaseProps = reducedMotion
    ? {}
    : { initial: 'hidden', animate: 'visible', variants: heroProofItem }

  return (
    <header className="members-plu-hero members-plu-hero--motion">
      <div className="members-plu-hero__grid">
        <Main className="members-plu-hero__main" {...mainProps}>
          <Chapter className="members-plu-hero__chapter" {...itemProps}>
            <span className="members-plu-hero__chapter-dot" aria-hidden />
            {t('pages.members.heroChapter')}
          </Chapter>
          <Title className="members-plu-hero__title" {...titleProps}>
            <TitleLine className="members-plu-hero__title-line" {...titleLineProps}>
              {t('pages.members.heroTitleLead')}
            </TitleLine>
            <TitleLine
              className="members-plu-hero__title-line members-plu-hero__title-line--accent"
              {...titleLineProps}
            >
              {t('pages.members.heroTitleAccent')}
            </TitleLine>
          </Title>
          <Desc className="members-plu-hero__desc" {...itemProps}>
            {t('pages.members.heroDesc')}
          </Desc>

          <CtaRow className="members-plu-hero__cta-row" {...itemProps}>
            <div className="members-plu-hero__buy">
              <Button variant="gold" disabled={ctaDisabled} onClick={onAffiliate}>
                {affiliationCta}
              </Button>
              {hasPrice ? (
                <p className="members-plu-hero__price">
                  <strong className="members-plu-hero__price-amount">{money(price, locale)}</strong>
                  <span className="members-plu-hero__price-period">{pricePeriod}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="members-plu-hero__secondary motion-icon-shift"
              onClick={() => scrollToId('requisitos')}
            >
              {t('pages.members.heroCtaSecondary')}
              <ArrowDown size={15} aria-hidden className="motion-icon-shift__target" />
            </button>
          </CtaRow>

          <Account
            className="members-plu-hero__account"
            aria-label={
              isLoggedInAthlete ? undefined : t('pages.members.existingMember')
            }
            {...itemProps}
          >
            {isLoggedInAthlete ? (
              <p className="members-plu-hero__signed-in">
                {t('pages.members.heroSignedIn', { name: session?.name ?? session?.email ?? '' })}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="members-plu-hero__account-link"
                  onClick={() => onNavigate('login')}
                >
                  {t('pages.members.loginLink')}
                </button>
                <span className="members-plu-hero__account-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="members-plu-hero__account-link"
                  onClick={() => onNavigate('register')}
                >
                  {t('pages.members.registerLink')}
                </button>
              </>
            )}
          </Account>
        </Main>

        <Showcase className="members-plu-hero__showcase" {...showcaseProps}>
          <CredentialCard
            className="members-plu-hero__card-tilt"
            eyebrow={t('pages.members.credentialAthleteLabel')}
            name={MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}
            code={MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}
            codeLabel={t('pages.members.credentialCodeLabel')}
            season={MEMBERSHIP_CREDENTIAL_SAMPLE.season}
            status={MEMBERSHIP_CREDENTIAL_SAMPLE.status}
            qrSrc={credentialQrSrc}
            qrAlt={t('pages.members.credentialQrAlt')}
            qrCaption={t('pages.members.credentialQrCaption')}
            flipToBackLabel={t('pages.members.credentialFlipToBack')}
            flipToFrontLabel={t('pages.members.credentialFlipToFront')}
            flipAriaLabel={t('pages.members.credentialFlipAria', {
              name: MEMBERSHIP_CREDENTIAL_SAMPLE.athlete,
            })}
            maxTilt={3.5}
          />
          <p className="members-cred__caption">{t('pages.members.credentialPreviewNote')}</p>
        </Showcase>
      </div>
    </header>
  )
}
