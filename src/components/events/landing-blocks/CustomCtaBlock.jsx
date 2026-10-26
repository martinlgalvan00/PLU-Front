import { isSafeLandingHref } from '../../../lib/eventLandingLayout.js'
import BlockShell from './BlockShell.jsx'

/** Botón propio. El link ya viene acotado a `https://` o ruta interna. */
export default function CustomCtaBlock({ block }) {
  const { title, body, label, href } = block.props ?? {}
  if (!label || !href || !isSafeLandingHref(href)) return null
  const external = /^https:\/\//i.test(href)
  return (
    <BlockShell id={block.id} type="cta" title={title || undefined} lead={body || undefined}>
      <p>
        <a
          className="lb-button"
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        >
          {label}
        </a>
      </p>
    </BlockShell>
  )
}
