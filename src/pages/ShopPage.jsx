import PageFrame from '../components/layout/PageFrame.jsx'
import { InfoCard } from '../components/ui/Cards.jsx'

export default function ShopPage({ onNavigate }) {
  return (
    <PageFrame eyebrow="Tienda" title="Productos, entradas y servicios">
      <div className="content-grid">
        <InfoCard
          title="Merch oficial"
          text="Próximamente: remeras, accesorios y productos de eventos."
        />
        <InfoCard
          title="Entradas de evento"
          text="Próximamente: entradas para público y acompañantes."
        />
        <InfoCard
          title="Inscripciones"
          text="Inscribite a competencias oficiales PLU ARG desde acá."
          action="Inscribirse"
          onAction={() => onNavigate('events')}
        />
      </div>
    </PageFrame>
  )
}
