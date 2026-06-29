export default function PageFrame({ children, eyebrow, title, description }) {
  return (
    <main className="content-page">
      <section className="page-heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p className="page-heading__desc">{description}</p>}
      </section>
      {children}
    </main>
  )
}
