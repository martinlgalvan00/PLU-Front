import AuditTimeline from '../ui/AuditTimeline.jsx'

export default function RecentActivity({ items = [] }) {
  return (
    <section className="recent-activity surface-card" aria-label="Actividad reciente">
      <header className="recent-activity__header">
        <h2>Actividad reciente</h2>
        <p>Últimos movimientos en la plataforma</p>
      </header>
      <AuditTimeline items={items} />
    </section>
  )
}
