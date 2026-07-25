export default function AdminPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className = '',
  compact = false,
}) {
  return (
    <header
      className={`admin-page-toolbar${actions ? ' admin-page-toolbar--with-actions' : ''}${compact ? ' admin-page-toolbar--compact' : ''}${className ? ` ${className}` : ''}`.trim()}
    >
      <div className="admin-page-toolbar__headline">
        {eyebrow && <span className="admin-page-toolbar__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && (
          <p
            className={`admin-page-toolbar__subtitle${compact ? ' admin-page-toolbar__subtitle--compact' : ''}`.trim()}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="admin-page-toolbar__tools admin-page-toolbar__tools--actions">{actions}</div>}
    </header>
  )
}
