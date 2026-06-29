export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const classes = ['btn', variant !== 'primary' ? `btn--${variant}` : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
}
