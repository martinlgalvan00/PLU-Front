export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  variant = 'default',
}) {
  const variantClass = variant === 'ref' ? ' section-heading--ref' : ''
  return (
    <header className={`section-heading section-heading--${align}${variantClass}`.trim()}>
      {eyebrow && <span className="section-heading__eyebrow">{eyebrow}</span>}
      <h2 className="section-heading__title">{title}</h2>
      {description && <p className="section-heading__desc">{description}</p>}
    </header>
  )
}
