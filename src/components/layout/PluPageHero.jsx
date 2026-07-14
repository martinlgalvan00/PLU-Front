import { m } from 'motion/react'

import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

export default function PluPageHero({
  align = 'center',
  breadcrumbLabel,
  chapter,
  children,
  className = '',
  description,
  onHome,
  title,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const alignClass = align === 'start' ? ' plu-page-hero--start' : ''
  const rootClass = `plu-page-hero plu-page-hero--motion${alignClass} ${className}`.trim()

  const breadcrumb = (
    <nav className="plu-page-hero__breadcrumb" aria-label="Breadcrumb">
      <button type="button" onClick={onHome}>
        {t('design.home')}
      </button>
      <span aria-hidden>/</span>
      <span>{breadcrumbLabel}</span>
    </nav>
  )

  const body = (
    <>
      {breadcrumb}
      {chapter ? <p className="plu-page-hero__chapter">{chapter}</p> : null}
      <h1 className="plu-page-hero__title">{title}</h1>
      {description ? <p className="plu-page-hero__desc">{description}</p> : null}
      {children ? <div className="plu-page-hero__extra">{children}</div> : null}
    </>
  )

  if (reducedMotion) {
    return <header className={rootClass}>{body}</header>
  }

  return (
    <m.header
      className={rootClass}
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <m.nav className="plu-page-hero__breadcrumb" aria-label="Breadcrumb" variants={heroSequenceItem}>
        <button type="button" onClick={onHome}>
          {t('design.home')}
        </button>
        <span aria-hidden>/</span>
        <span>{breadcrumbLabel}</span>
      </m.nav>
      {chapter ? (
        <m.p className="plu-page-hero__chapter" variants={heroSequenceItem}>
          {chapter}
        </m.p>
      ) : null}
      <m.h1 className="plu-page-hero__title" variants={heroSequenceItem}>
        {title}
      </m.h1>
      {description ? (
        <m.p className="plu-page-hero__desc" variants={heroSequenceItem}>
          {description}
        </m.p>
      ) : null}
      {children ? (
        <m.div className="plu-page-hero__extra" variants={heroSequenceItem}>
          {children}
        </m.div>
      ) : null}
    </m.header>
  )
}
