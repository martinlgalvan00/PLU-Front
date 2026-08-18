import { m } from 'motion/react'

import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

export default function PluPageHero({
  align = 'center',
  aside,
  breadcrumbLabel,
  chapter,
  children,
  className = '',
  description,
  onHome,
  title,
  variant = 'index',
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const alignClass = align === 'start' ? ' plu-page-hero--start' : ''
  const asideClass = aside ? ' plu-page-hero--with-aside' : ' plu-page-hero--solo'
  const rootClass =
    `plu-page-hero plu-page-hero--${variant} plu-page-hero--motion${alignClass}${asideClass} ${className}`.trim()

  const Root = reducedMotion ? 'header' : m.header
  const Breadcrumb = reducedMotion ? 'nav' : m.nav
  const Chapter = reducedMotion ? 'p' : m.p
  const Title = reducedMotion ? 'h1' : m.h1
  const Description = reducedMotion ? 'p' : m.p
  const Extra = reducedMotion ? 'div' : m.div
  const Aside = reducedMotion ? 'aside' : m.aside
  const itemProps = reducedMotion ? {} : { variants: heroSequenceItem }
  const rootProps = reducedMotion
    ? {}
    : { initial: 'hidden', animate: 'visible', variants: heroStaggerContainer }

  return (
    <Root className={rootClass} {...rootProps}>
      <div className="plu-page-hero__inner">
        <div className="plu-page-hero__copy">
          <Breadcrumb className="plu-page-hero__breadcrumb" aria-label="Breadcrumb" {...itemProps}>
            <button type="button" onClick={onHome}>
              {t('design.home')}
            </button>
            <span aria-hidden>/</span>
            <span>{breadcrumbLabel}</span>
          </Breadcrumb>
          {chapter ? (
            <Chapter className="plu-page-hero__chapter" {...itemProps}>
              {chapter}
            </Chapter>
          ) : null}
          <Title className="plu-page-hero__title" {...itemProps}>
            {title}
          </Title>
          {description ? (
            <Description className="plu-page-hero__desc" {...itemProps}>
              {description}
            </Description>
          ) : null}
          {children ? (
            <Extra className="plu-page-hero__extra" {...itemProps}>
              {children}
            </Extra>
          ) : null}
        </div>
        {aside ? (
          <Aside className="plu-page-hero__aside" {...itemProps}>
            {aside}
          </Aside>
        ) : null}
      </div>
    </Root>
  )
}
