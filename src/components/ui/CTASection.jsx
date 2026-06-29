export default function CTASection({ title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <section className="cta-section">
      <div className="cta-section__inner">
        <h2 className="cta-section__title">{title}</h2>
        {description && <p className="cta-section__desc">{description}</p>}
        <div className="cta-section__actions">
          {primaryLabel && (
            <button type="button" className="btn" onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && (
            <button type="button" className="btn btn--outline" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
