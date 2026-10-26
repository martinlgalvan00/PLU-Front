import EventLiveStream from '../../ui/EventLiveStream.jsx'
import BlockShell from './BlockShell.jsx'

export default function LivestreamBlock({ block, ctx }) {
  const { event } = ctx
  if (!event?.liveStreamUrl) return null
  return (
    <BlockShell id={block.id} type="livestream">
      <EventLiveStream
        liveStatus={event.liveStatus}
        liveStreamUrl={event.liveStreamUrl}
        liveStreamProvider={event.liveStreamProvider}
      />
    </BlockShell>
  )
}
