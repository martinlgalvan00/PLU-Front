import Button from './Button.jsx'

export default function CTASection({ title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <section className="cta-section">
      <div className="cta-section__inner">
        <h2 className="cta-section__title">{title}</h2>
        {description && <p className="cta-section__desc">{description}</p>}
        <div className="cta-section__actions">
          {primaryLabel && <Button onClick={onPrimary}>{primaryLabel}</Button>}
          {secondaryLabel && (
            <Button variant="outline" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
