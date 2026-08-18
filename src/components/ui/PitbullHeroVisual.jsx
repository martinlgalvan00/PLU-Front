import photoMedals from '../../assets/DSC01606-display.jpg'
import photoMedalsAvif from '../../assets/DSC01606-display.avif'
import photoMedalsAvif480 from '../../assets/DSC01606-display-480.avif'
import photoMedalsAvif800 from '../../assets/DSC01606-display-800.avif'
import photoMedalsWebp from '../../assets/DSC01606-display.webp'
import photoMedalsWebp480 from '../../assets/DSC01606-display-480.webp'
import photoMedalsWebp800 from '../../assets/DSC01606-display-800.webp'
import ResponsivePhoto from './ResponsivePhoto.jsx'

const MEDALS_AVIF = { 480: photoMedalsAvif480, 800: photoMedalsAvif800, 1153: photoMedalsAvif }
const MEDALS_WEBP = { 480: photoMedalsWebp480, 800: photoMedalsWebp800, 1153: photoMedalsWebp }

export default function PitbullHeroVisual({ categories = [], date, minimal = false, t, venue }) {
  if (minimal) {
    return (
      <figure className="pitbull-hero-visual pitbull-hero-visual--band">
        <ResponsivePhoto
          className="pitbull-hero-visual__img"
          avif={MEDALS_AVIF}
          webp={MEDALS_WEBP}
          src={photoMedals}
          alt=""
          width={800}
          height={1200}
          sizes="(min-width: 1024px) 400px, 100vw"
          loading="eager"
          fetchPriority="high"
        />
        <figcaption className="pitbull-hero-visual__caption">
          {t('pages.pitbull.visualAlt')}
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className="pitbull-hero-visual pitbull-hero-visual--portrait">
      <div className="pitbull-hero-visual__frame">
        <div className="pitbull-hero-visual__media">
          <ResponsivePhoto
            className="pitbull-hero-visual__img"
            avif={MEDALS_AVIF}
            webp={MEDALS_WEBP}
            src={photoMedals}
            alt=""
            width={800}
            height={1200}
            sizes="(min-width: 1024px) 400px, 100vw"
            loading="eager"
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
      <figcaption className="pitbull-hero-visual__caption">
        {t('pages.pitbull.visualAlt')}
      </figcaption>
    </figure>
  )
}
