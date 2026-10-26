import { MapPin } from 'lucide-react'
import { landingMapHref } from '../../../lib/eventLandingLayout.js'
import BlockShell from './BlockShell.jsx'

/** Cómo llegar a la sede: la dirección y un link al mapa (sin iframe de mapas). */
export default function CustomMapBlock({ block, ctx }) {
  const { title, body } = block.props ?? {}
  const href = landingMapHref(block.props)
  if (!href && !body) return null
  return (
    <BlockShell id={block.id} type="map" title={title || undefined}>
      <div className="lb-directions">
        {body ? (
          <p className="lb-directions__address">
            <MapPin size={18} aria-hidden />
            <span>{body}</span>
          </p>
        ) : null}
        {href ? (
          <p>
            <a className="lb-button" href={href} target="_blank" rel="noreferrer noopener">
              {ctx?.t ? ctx.t('pages.eventBuilder.directions') : 'Cómo llegar'}
            </a>
          </p>
        ) : null}
      </div>
    </BlockShell>
  )
}
