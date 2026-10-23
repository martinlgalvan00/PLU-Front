import EventWeighInSchedule, { eventHasWeighInWindows } from '../../ui/EventWeighInSchedule.jsx'
import BlockShell from './BlockShell.jsx'

export default function WeighInsBlock({ block, ctx }) {
  const { event, t } = ctx
  if (!eventHasWeighInWindows(event)) return null
  return (
    <BlockShell id={block.id} type="weighIns" title={t('pages.events.weighInsTitle')}>
      <EventWeighInSchedule windows={event.weighInWindows} />
    </BlockShell>
  )
}
