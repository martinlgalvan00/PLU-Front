import photoMedals from '../../assets/DSC01606-display.jpg'

export default function PitbullHeroVisual({ categories = [], date, minimal = false, t, venue }) {
  if (minimal) {
    return (
      <figure className="pitbull-hero-visual pitbull-hero-visual--band">
        <img
          className="pitbull-hero-visual__img"
          src={photoMedals}
          alt=""
          width={800}
          height={1200}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <figcaption className="pitbull-hero-visual__caption">{t('pages.pitbull.visualAlt')}</figcaption>
      </figure>
    )
  }

  return (
    <figure className="pitbull-hero-visual pitbull-hero-visual--portrait">
      <div className="pitbull-hero-visual__frame">
        <div className="pitbull-hero-visual__media">
          <img
            className="pitbull-hero-visual__img"
            src={photoMedals}
            alt=""
            width={800}
            height={1200}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div className="pitbull-hero-visual__scrim" aria-hidden />
          <span className="pitbull-hero-visual__badge">{t('pages.pitbull.officialBadge')}</span>
          <div className="pitbull-hero-visual__foot">
            <div className="pitbull-hero-visual__meta">
              <span className="pitbull-hero-visual__venue">{venue}</span>
              {date ? <span className="pitbull-hero-visual__date">{date}</span> : null}
            </div>
            {categories.length > 0 ? (
              <ul className="pitbull-hero-visual__tags" aria-label={t('pages.pitbull.categories')}>
                {categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
      <figcaption className="pitbull-hero-visual__caption">{t('pages.pitbull.visualAlt')}</figcaption>
    </figure>
  )
}
