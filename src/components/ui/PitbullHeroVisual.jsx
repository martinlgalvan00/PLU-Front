import heroPhoto from '../../assets/powerlifting-hero.png'

export default function PitbullHeroVisual({ t }) {
  return (
    <figure className="pitbull-hero-visual" aria-hidden>
      <div className="pitbull-hero-visual__frame">
        <div className="pitbull-hero-visual__media">
          <img
            className="pitbull-hero-visual__img"
            src={heroPhoto}
            alt=""
            width={960}
            height={600}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div className="pitbull-hero-visual__scrim" aria-hidden />
        </div>
      </div>
      <figcaption className="pitbull-hero-visual__caption">{t('pages.pitbull.visualAlt')}</figcaption>
    </figure>
  )
}
