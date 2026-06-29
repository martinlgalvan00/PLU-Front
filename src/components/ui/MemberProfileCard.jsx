import StatusPill from './StatusPill.jsx'

export default function MemberProfileCard({
  name,
  documentId,
  email,
  gym,
  status,
  memberCode,
  onAction,
  actionLabel = 'Ver perfil',
}) {
  return (
    <article className="member-profile-card surface-card">
      <header className="member-profile-card__header">
        <div>
          <h3>{name}</h3>
          {memberCode && <span className="member-profile-card__code">{memberCode}</span>}
        </div>
        {status && <StatusPill value={status} />}
      </header>
      <dl className="member-profile-card__grid">
        {documentId && (
          <>
            <dt>Documento</dt>
            <dd>{documentId}</dd>
          </>
        )}
        {email && (
          <>
            <dt>Email</dt>
            <dd>{email}</dd>
          </>
        )}
        {gym && (
          <>
            <dt>Gimnasio</dt>
            <dd>{gym}</dd>
          </>
        )}
      </dl>
      {onAction && (
        <button type="button" className="btn btn--small btn--block" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </article>
  )
}
