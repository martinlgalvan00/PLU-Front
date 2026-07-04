import { FileDown } from 'lucide-react'
import {
  RULEBOOK_DIVISIONS,
  RULEBOOK_DOWNLOAD,
  RULEBOOK_EQUIPMENT,
  RULEBOOK_JUDGING,
  RULEBOOK_WEIGHT_CATEGORIES,
} from '../lib/content.js'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SubNav from '../components/ui/SubNav.jsx'

const SUB_NAV_ITEMS = [
  { href: '#reg-descarga', label: 'Descarga', shortLabel: 'PDF' },
  { href: '#reg-categorias', label: 'Categorías de peso', shortLabel: 'Peso' },
  { href: '#reg-divisiones', label: 'Divisiones', shortLabel: 'Edad' },
  { href: '#reg-equipamiento', label: 'Equipamiento', shortLabel: 'Equipo' },
  { href: '#reg-jueceo', label: 'Jueceo', shortLabel: 'Jueces' },
]

function RulebookPanel({ id, num, title, note, children }) {
  return (
    <section id={id} className="anchor-target rulebook-panel">
      <header className="rulebook-panel__header">
        <span className="rulebook-panel__num">{num}</span>
        <h2 className="rulebook-panel__title">{title}</h2>
      </header>
      <div className="rulebook-panel__body">{children}</div>
      {note && <p className="rulebook-panel__note">{note}</p>}
    </section>
  )
}

export default function RulebookPage({ onNavigate }) {
  return (
    <main className="page rulebook-page">
      <DesignPageHero
        breadcrumbLabel="Reglamento"
        onHome={() => onNavigate?.('home')}
        eyebrow="Rulebook"
        title="Reglamento oficial PLU ARG"
        description="Categorías, divisiones, equipamiento y jueceo bajo un mismo estándar."
      />

      <SubNav items={SUB_NAV_ITEMS} />

      <div className="page__inner rulebook-sections">
        <Reveal>
          <section id="reg-descarga" className="anchor-target rulebook-panel rulebook-panel--download">
            <div className="rulebook-download">
              <span className="rulebook-download__icon" aria-hidden>
                <FileDown size={22} strokeWidth={1.75} />
              </span>
              <div className="rulebook-download__copy">
                <h2 className="rulebook-download__title">{RULEBOOK_DOWNLOAD.title}</h2>
                <p className="rulebook-download__meta">{RULEBOOK_DOWNLOAD.subtitle}</p>
              </div>
              <Button variant="outline" disabled>
                {RULEBOOK_DOWNLOAD.action}
              </Button>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <RulebookPanel id="reg-categorias" num="01" title="Categorías de peso corporal">
            <div className="rulebook-split">
              {RULEBOOK_WEIGHT_CATEGORIES.map((item) => (
                <div key={item.title} className="rulebook-split__col">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </RulebookPanel>
        </Reveal>

        <Reveal>
          <RulebookPanel
            id="reg-divisiones"
            num="02"
            title="Divisiones por edad"
            note="Rangos de ejemplo, sujetos a confirmación en el reglamento final."
          >
            <dl className="rulebook-meta-list">
              {RULEBOOK_DIVISIONS.map((division) => (
                <div key={division.title} className="rulebook-meta-list__row">
                  <dt>{division.title}</dt>
                  <dd>{division.range}</dd>
                </div>
              ))}
            </dl>
          </RulebookPanel>
        </Reveal>

        <Reveal>
          <RulebookPanel id="reg-equipamiento" num="03" title="Equipamiento">
            <div className="rulebook-equipment-list">
              {RULEBOOK_EQUIPMENT.map((item) => (
                <article key={item.title} className="rulebook-equipment-item">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </RulebookPanel>
        </Reveal>

        <Reveal>
          <RulebookPanel id="reg-jueceo" num="04" title="Criterios básicos de jueceo">
            <ol className="rulebook-judging-list">
              {RULEBOOK_JUDGING.map((rule) => (
                <li key={rule.numeral}>
                  <span className="rulebook-judging-list__numeral">{rule.numeral}</span>
                  <p>{rule.text}</p>
                </li>
              ))}
            </ol>
          </RulebookPanel>
        </Reveal>

        <div className="rulebook-page__action">
          <Button variant="outline" onClick={() => onNavigate('contact')}>
            Consultar al equipo técnico
          </Button>
        </div>
      </div>
    </main>
  )
}
