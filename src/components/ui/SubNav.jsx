export default function SubNav({ items, label = 'Navegación de sección' }) {
  return (
    <nav className="sub-nav" aria-label={label}>
      <div className="sub-nav__inner">
        {items.map((item) => (
          <a key={item.href} href={item.href} className="sub-nav__link">
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
