export default function FormSection({ step, title, description, children }) {
  return (
    <section className="form-section-block">
      <header className="form-section-block__header">
        {step && <span className="form-section-block__step">{step}</span>}
        <div>
          <h2 className="form-section-block__title">{title}</h2>
          {description && <p className="form-section-block__desc">{description}</p>}
        </div>
      </header>
      <div className="form-section-block__body">{children}</div>
    </section>
  )
}
