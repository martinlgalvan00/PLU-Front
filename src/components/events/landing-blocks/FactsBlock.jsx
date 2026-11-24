import { CalendarDays, MapPin } from 'lucide-react'
import BlockShell from './BlockShell.jsx'

function formatDate(event, locale) {
  const value = event?.startsAt ?? (event?.dateISO ? `${event.dateISO}T12:00:00` : '')
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Fecha, sede y ciudad: lo que el atleta busca primero. */
export default function FactsBlock({ block, ctx }) {
  const { event, locale, t } = ctx
  const facts = [
    { key: 'date', icon: CalendarDays, label: t('pages.eventBuilder.date'), value: formatDate(event, locale) },
    { key: 'venue', icon: MapPin, label: t('pages.eventBuilder.venue'), value: event?.venue },
    { key: 'location', icon: MapPin, label: t('pages.eventBuilder.location'), value: event?.location },
  ].filter((fact) => fact.value)
  if (facts.length === 0) return null

  return (
    <BlockShell id={block.id} type="facts">
      <dl className="lb-facts">
        {facts.map(({ key, icon: Icon, label, value }) => (
          <div key={key}>
            <dt>
              <Icon aria-hidden size={15} />
              {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </BlockShell>
  )
}
