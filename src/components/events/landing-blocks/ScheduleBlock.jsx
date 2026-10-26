import PublicEventSchedule from '../../ui/PublicEventSchedule.jsx'
import { usePublicEventSchedule } from '../../../hooks/usePublicEventSchedule.js'
import BlockShell from './BlockShell.jsx'

/** Grilla publicada por la organización. Vacía: el bloque no existe. */
export default function ScheduleBlock({ block, ctx }) {
  const { event, t } = ctx
  const { schedule, updatedAt } = usePublicEventSchedule(event?.slug, { enabled: true })
  if (!schedule?.hasContent) return null
  return (
    <BlockShell
      id={block.id}
      type="schedule"
      title={t('pages.events.publicScheduleTitle')}
      lead={t('pages.events.publicScheduleLead')}
    >
      <PublicEventSchedule schedule={schedule} updatedAt={updatedAt} />
    </BlockShell>
  )
}
