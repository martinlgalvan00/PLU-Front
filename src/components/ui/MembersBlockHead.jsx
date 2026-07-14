export default function MembersBlockHead({ eyebrow, title, lead, className = '' }) {
  return (
    <header className={`members-block-head ${className}`.trim()}>
      {eyebrow ? <p className="members-block-head__eyebrow">{eyebrow}</p> : null}
      <h2 className="members-block-head__title">{title}</h2>
      {lead ? <p className="members-block-head__lead">{lead}</p> : null}
    </header>
  )
}
