import Reveal from '../ui/Reveal.jsx'

export default function PageHero({ eyebrow, title, description, children, compact = false }) {
  return (
    <Reveal>
      <header className={`page-hero ${compact ? 'page-hero--compact' : ''}`}>
        <div className="page-hero__glow" aria-hidden />
        {eyebrow && <span className="page-hero__eyebrow">{eyebrow}</span>}
        <h1 className="page-hero__title">{title}</h1>
        {description && <p className="page-hero__desc">{description}</p>}
        {children}
      </header>
    </Reveal>
  )
}
