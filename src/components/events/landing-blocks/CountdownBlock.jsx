import EventCountdown from '../../ui/EventCountdown.jsx'
import BlockShell from './BlockShell.jsx'

export default function CountdownBlock({ block, ctx }) {
  const { event, onNavigate } = ctx
  if (!event?.startsAt && !event?.dateISO) return null
  return (
    <BlockShell id={block.id} type="countdown">
      <EventCountdown event={event} onNavigate={onNavigate} />
    </BlockShell>
  )
}
