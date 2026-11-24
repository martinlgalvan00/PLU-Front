import { customBlockImageKeys, imageUrlKey } from '../../../lib/eventLandingLayout.js'
import BlockShell from './BlockShell.jsx'

/** Galería de fotos: las que se subieron, en el orden de los lugares. */
export default function CustomGalleryBlock({ block }) {
  const props = block.props ?? {}
  const photos = customBlockImageKeys('gallery')
    .map((pathKey) => props[imageUrlKey(pathKey)])
    .filter(Boolean)
  if (photos.length === 0) return null
  const name = props.title || props.caption || ''
  return (
    <BlockShell id={block.id} type="gallery" title={props.title || undefined}>
      <figure className="lb-gallery">
        <ul className="lb-gallery__grid" data-count={photos.length}>
          {photos.map((url, index) => (
            <li key={url}>
              <img
                alt={name ? `${name} · ${index + 1}` : ''}
                className="lb-gallery__image"
                loading="lazy"
                src={url}
              />
            </li>
          ))}
        </ul>
        {props.caption ? <figcaption>{props.caption}</figcaption> : null}
      </figure>
    </BlockShell>
  )
}
