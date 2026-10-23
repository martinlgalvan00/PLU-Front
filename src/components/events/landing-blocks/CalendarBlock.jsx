import EventCalendarActions from '../../ui/EventCalendarActions.jsx'
import BlockShell from './BlockShell.jsx'

export default function CalendarBlock({ block, ctx }) {
  const { event } = ctx
  if (!event?.startsAt || !event?.endsAt) return null
  return (
    <BlockShell id={block.id} type="calendar">
      <EventCalendarActions event={event} variant="minimal" />
    </BlockShell>
  )
}
