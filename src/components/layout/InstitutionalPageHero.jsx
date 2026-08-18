import { ChevronRight } from 'lucide-react'

export default function InstitutionalPageHero({
  aside,
  breadcrumb,
  className = '',
  description,
  eyebrow,
  index = 'PLU ARG',
  onHome,
  title,
}) {
  const titleId = `institutional-hero-${String(breadcrumb)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`

  return (
    <section
      className={`institutional-hero ${aside ? 'institutional-hero--with-aside' : 'institutional-hero--solo'} ${className}`.trim()}
      aria-labelledby={titleId}
    >
      <div className="institutional-hero__inner">
        <nav className="institutional-hero__breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={onHome}>
            Home
          </button>
          <ChevronRight size={12} aria-hidden />
          <span aria-current="page">{breadcrumb}</span>
        </nav>

        <div className="institutional-hero__grid">
          <div className="institutional-hero__copy">
            <p className="institutional-hero__eyebrow">
              <span>{index}</span>
              {eyebrow}
            </p>
            <h1 id={titleId}>{title}</h1>
            <p className="institutional-hero__description">{description}</p>
          </div>
          {aside ? <div className="institutional-hero__aside">{aside}</div> : null}
        </div>
      </div>
    </section>
  )
}
