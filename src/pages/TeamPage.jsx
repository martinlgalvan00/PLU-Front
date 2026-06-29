import PageFrame from '../components/layout/PageFrame.jsx'
import { InfoCard } from '../components/ui/Cards.jsx'

export default function TeamPage() {
  return (
    <PageFrame eyebrow="Unite al equipo" title="Construí la liga desde adentro">
      <div className="content-grid">
        <InfoCard
          title="Oficiales y jueces"
          text="Registro de jueces, planillas y certificaciones."
        />
        <InfoCard
          title="Directores de evento"
          text="Herramientas para sedes, calendarios, categorías, pagos y exportaciones."
        />
        <InfoCard
          title="Gimnasios afiliados"
          text="Registro de equipos, gimnasios y responsables técnicos por provincia."
        />
      </div>
    </PageFrame>
  )
}
