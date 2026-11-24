import BlockShell from './BlockShell.jsx'

export default function CustomTextBlock({ block }) {
  const { eyebrow, title, body } = block.props ?? {}
  if (!title && !body) return null
  return (
    <BlockShell id={block.id} type="text" eyebrow={eyebrow || undefined} title={title || undefined}>
      {body ? <p className="lb-prose">{body}</p> : null}
    </BlockShell>
  )
}
