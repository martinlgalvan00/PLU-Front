import { ArrowRight } from 'lucide-react'
import AnimatedSectionHeader from '../../motion/AnimatedSectionHeader.tsx'

export default function CommunitySectionHeader({
  compact = false,
  ctaLabel,
  description,
  eyebrow,
  onCta,
  title,
  titleId,
}) {
  const headClass = `community-section__head${compact ? ' community-section__head--compact' : ''}`.trim()

  return (
    <div className={headClass}>
      <AnimatedSectionHeader
        align="left"
        className="community-section__motion-header motion-section-header--community"
        description={description}
        eyebrow={eyebrow}
        showRule={false}
        title={title}
        titleId={titleId}
      />
      {ctaLabel && onCta ? (
        <button type="button" className="community-section__link motion-icon-shift" onClick={onCta}>
          {ctaLabel}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      ) : null}
    </div>
  )
}
