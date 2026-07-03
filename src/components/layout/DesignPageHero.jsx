import { useI18n } from '../../i18n/I18nProvider.jsx'
import Reveal from '../ui/Reveal.jsx'

export default function DesignPageHero({
  breadcrumbLabel,
  onHome,
  eyebrow,
  title,
  description,
  children,
  align = 'left',
}) {
  const { t } = useI18n()

  return (
    <Reveal>
      <header className={`design-hero design-hero--${align}`}>
        <div className="design-hero__inner">
          {breadcrumbLabel && (
            <nav className="design-hero__breadcrumb" aria-label="Breadcrumb">
              <button type="button" onClick={onHome}>
                {t('design.home')}
              </button>
              <span aria-hidden>/</span>
              <span>{breadcrumbLabel}</span>
            </nav>
          )}
          {eyebrow && <span className="design-hero__eyebrow">{eyebrow}</span>}
          <h1 className="design-hero__title">{title}</h1>
          {description && <p className="design-hero__desc">{description}</p>}
          {children}
        </div>
      </header>
    </Reveal>
  )
}
