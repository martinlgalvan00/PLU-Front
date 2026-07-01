export default function AdminPageHeader({ title, subtitle, eyebrow = 'PLU ARG', actions }) {
  return (
    <header className={`admin-page-toolbar${actions ? ' admin-page-toolbar--with-actions' : ''}`}>
      <div className="admin-page-toolbar__headline">
        <span className="admin-page-toolbar__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p className="admin-page-toolbar__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="admin-page-toolbar__tools admin-page-toolbar__tools--actions">{actions}</div>}
    </header>
  )
}
