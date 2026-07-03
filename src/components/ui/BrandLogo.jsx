import { BRAND } from '../../lib/brand.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const LOGO_VARIANTS = {
  letterhead: {
    src: BRAND.logoLetterheadUrl,
    altKey: 'logoAlt',
    aspect: 3.75,
  },
  argentina: {
    src: BRAND.logoArgentinaUrl,
    altKey: 'logoArgentinaAlt',
    aspect: 1,
  },
}

/**
 * Logo oficial PLU — letterhead (Powerlifting United) o emblema Argentina.
 * @param {boolean} [letterheadBlend] — en dark mode, funde el PNG contra fondos translúcidos (header).
 */
export default function BrandLogo({
  className = '',
  imgClassName = '',
  height = 32,
  variant = 'letterhead',
  letterheadBlend = false,
  showText = false,
  textClassName = '',
  alt,
}) {
  const { t } = useI18n()
  const config = LOGO_VARIANTS[variant] ?? LOGO_VARIANTS.letterhead
  const isLetterhead = variant === 'letterhead'
  const imgClasses = [
    isLetterhead && 'brand-logo-letterhead',
    isLetterhead && letterheadBlend && 'brand-logo-letterhead--blend',
    imgClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <img
        src={config.src}
        alt={alt ?? BRAND[config.altKey] ?? t('brand.name')}
        className={imgClasses}
        height={height}
        width={Math.round(height * config.aspect)}
        decoding="async"
      />
      {showText && <span className={textClassName}>{t('brand.name')}</span>}
    </>
  )
}
