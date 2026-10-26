/**
 * Marco común de un bloque de la landing Constructor: ancho, ritmo vertical y
 * encabezado (eyebrow / título / bajada). Sin cards: regla superior y flujo abierto.
 */
export default function BlockShell({
  id,
  type,
  eyebrow,
  title,
  lead,
  titleId,
  children,
  className = '',
}) {
  const headingId = titleId ?? (title ? `lb-${id}-title` : undefined)
  return (
    <section
      id={`bloque-${id}`}
      className={`lb-block lb-block--${type} ${className}`.trim()}
      aria-labelledby={headingId}
      data-scene=""
    >
      <div className="lb-block__inner" data-scene-content="">
        {eyebrow || title || lead ? (
          <header className="lb-block__head">
            {eyebrow ? <p className="lb-block__eyebrow">{eyebrow}</p> : null}
            {title ? (
              <h2 id={headingId} className="lb-block__title">
                {title}
              </h2>
            ) : null}
            {lead ? <p className="lb-block__lead">{lead}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  )
}
