import StatusPill from './StatusPill.jsx'
import { initials } from '../../lib/format.js'

/**
 * @param {'grid' | 'inline' | 'none'} [metaLayout]
 */
export default function MemberProfileCard({
  name,
  documentId,
  email,
  gym,
  photoUrl,
  status,
  memberCode,
  onAction,
  actionLabel = 'Ver perfil',
  className = '',
  flat = false,
  metaLayout = 'grid',
}) {
  const avatar = initials(name) || '?'
  const metaItems = [
    documentId ? { label: 'Documento', value: documentId } : null,
    email ? { label: 'Email', value: email } : null,
    gym ? { label: 'Gimnasio', value: gym } : null,
  ].filter(Boolean)

  const inlineFacts = [documentId, gym].filter(Boolean)

  return (
    <article
      className={[
        'member-profile-card',
        'surface-card',
        flat ? 'surface-card--flat' : '',
        metaLayout === 'inline' ? 'member-profile-card--inline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="member-profile-card__header">
        <div className="member-profile-card__identity">
          <span className="member-profile-card__avatar" aria-hidden="true">
            {photoUrl ? (
              <img
                className="member-profile-card__avatar-photo"
                src={photoUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
            ) : null}
            {avatar}
          </span>
          <div className="member-profile-card__titles">
            <h3>{name}</h3>
            {memberCode ? <span className="member-profile-card__code">{memberCode}</span> : null}
            {metaLayout === 'inline' && inlineFacts.length > 0 ? (
              <p className="member-profile-card__facts">
                {inlineFacts.map((fact, index) => (
                  <span key={fact}>
                    {index > 0 ? (
                      <span className="member-profile-card__dot" aria-hidden="true" />
                    ) : null}
                    <span>{fact}</span>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
        {status ? <StatusPill value={status} /> : null}
      </header>

      {metaLayout === 'grid' && metaItems.length > 0 ? (
        <dl className="member-profile-card__meta">
          {metaItems.map((item) => (
            <div key={item.label} className="member-profile-card__meta-item">
              <dt>{item.label}</dt>
              <dd title={item.value}>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {onAction ? (
        <button type="button" className="btn btn--small btn--block" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  )
}
