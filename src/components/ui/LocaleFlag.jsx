export function FlagAr({ className = '', title = 'Español' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 16"
      width="24"
      height="16"
      role="img"
      aria-label={title}
    >
      <rect width="24" height="16" fill="#74ACDF" />
      <rect y="5.33" width="24" height="5.34" fill="#FFFFFF" />
      <circle cx="12" cy="8" r="2.1" fill="#F6B40E" />
      <circle cx="12" cy="8" r="1.35" fill="#85340A" opacity="0.35" />
    </svg>
  )
}

export function FlagUs({ className = '', title = 'English' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 16"
      width="24"
      height="16"
      role="img"
      aria-label={title}
    >
      <rect width="24" height="16" fill="#B22234" />
      <rect y="1.23" width="24" height="1.23" fill="#FFFFFF" />
      <rect y="3.69" width="24" height="1.23" fill="#FFFFFF" />
      <rect y="6.15" width="24" height="1.23" fill="#FFFFFF" />
      <rect y="8.62" width="24" height="1.23" fill="#FFFFFF" />
      <rect y="11.08" width="24" height="1.23" fill="#FFFFFF" />
      <rect y="13.54" width="24" height="1.23" fill="#FFFFFF" />
      <rect width="9.6" height="8.62" fill="#3C3B6E" />
    </svg>
  )
}
