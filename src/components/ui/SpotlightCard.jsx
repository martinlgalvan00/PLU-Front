export default function SpotlightCard({
  children,
  className = '',
  as: Component = 'div',
  ...props
}) {
  return (
    <Component className={`surface-card ${className}`.trim()} {...props}>
      {children}
    </Component>
  )
}
