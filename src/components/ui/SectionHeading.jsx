export default function SectionHeading({ eyebrow, title, description, align = 'center' }) {
  return (
    <header className={`section-heading section-heading--${align}`}>
      {eyebrow && (
        <span className="section-heading__eyebrow">
          <span className="section-heading__eyebrow-line" aria-hidden />
          {eyebrow}
        </span>
      )}
      <h2 className="section-heading__title">{title}</h2>
      {description && <p className="section-heading__desc">{description}</p>}
    </header>
  )
}
