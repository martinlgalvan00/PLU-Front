import { customBlockImageKeys, imageUrlKey } from '../../../lib/eventLandingLayout.js'
import BlockShell from './BlockShell.jsx'

/** Sponsors: los logos sobre una banda neutra, sin competir con el evento. */
export default function CustomSponsorsBlock({ block }) {
  const props = block.props ?? {}
  const logos = customBlockImageKeys('sponsors')
    .map((pathKey) => props[imageUrlKey(pathKey)])
    .filter(Boolean)
  if (logos.length === 0) return null
  return (
    <BlockShell id={block.id} type="sponsors" title={props.title || undefined}>
      <ul className="lb-sponsors">
        {logos.map((url) => (
          <li key={url}>
            <img alt="" className="lb-sponsors__logo" loading="lazy" src={url} />
          </li>
        ))}
      </ul>
    </BlockShell>
  )
}
