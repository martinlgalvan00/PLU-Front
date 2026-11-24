import BlockShell from './BlockShell.jsx'

export default function CustomImageBlock({ block }) {
  const { url, alt, caption } = block.props ?? {}
  if (!url) return null
  return (
    <BlockShell id={block.id} type="image">
      <figure className="lb-figure">
        <img alt={alt || ''} className="lb-figure__image" loading="lazy" src={url} />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    </BlockShell>
  )
}
