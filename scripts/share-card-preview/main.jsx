/**
 * main.jsx — harness de preview de EventShareCard (solo dev tooling).
 *
 * Página standalone servida por el dev server de Vite en
 * /scripts/share-card-preview/index.html. Monta las variantes de la card
 * con datos de muestra a tamaño real (1080px) y expone
 * window.__shareCardPreview.captureAll() que las rasteriza con el MISMO
 * pipeline de producción (eventCardService.generateEventCard → html2canvas).
 *
 * Sirve para dos cosas:
 *   1. Iterar el diseño en vivo (HMR sobre event-share-card.css).
 *   2. Generar los PNGs versionados de docs/share-card-previews/ via
 *      scripts/render-share-card-previews.mjs.
 *
 * No forma parte de la app ni del build de producción.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles/index.css'
import { I18nProvider } from '../../src/i18n/I18nProvider.jsx'
import EventShareCard from '../../src/components/ui/EventShareCard.jsx'
import { generateEventCard } from '../../src/services/eventCardService.js'

const PITBULL = {
  eventTitle: 'Pitbull Classic 2026',
  eventDate: '12-13 Dic 2026',
  eventVenue: 'Maximal Strength Club',
  eventLocation: 'Buenos Aires',
  eventSlug: 'pitbull-classic-2026',
}

/** Peor caso de contraste para el velo del retrato: una foto lisa blanca.
 *  Si el nombre y los datos se leen sobre esto, se leen sobre cualquier foto. */
const WHITE_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ffffff"/></svg>',
  )

const FIXTURES = [
  {
    name: 'afiliacion-historia',
    label: 'Afiliación · historia (1080×1920)',
    props: {
      variant: 'membership',
      format: 'story',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      membershipSeason: '2026',
      membershipExpiration: '31 ene 2027',
    },
  },
  {
    name: 'afiliacion-post',
    label: 'Afiliación · post (1080×1080)',
    props: {
      variant: 'membership',
      format: 'square',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      membershipSeason: '2026',
      membershipExpiration: '31 ene 2027',
    },
  },
  {
    name: 'afiliacion-foto-historia',
    label: 'Afiliación con foto de perfil · historia',
    props: {
      variant: 'membership',
      format: 'story',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      athletePhotoUrl: 'https://picsum.photos/seed/plu-athlete/400/400',
      membershipSeason: '2026',
      membershipExpiration: '31 ene 2027',
    },
  },
  {
    name: 'inscripcion-historia',
    label: 'Inscripción a torneo · historia',
    props: {
      variant: 'event',
      format: 'story',
      athleteName: 'Agustín Di Santo',
      athleteCode: 'PA-2847',
      category: 'Youth',
      division: 'Clásico',
      ...PITBULL,
    },
  },
  {
    name: 'inscripcion-post',
    label: 'Inscripción a torneo · post',
    props: {
      variant: 'event',
      format: 'square',
      athleteName: 'Agustín Di Santo',
      athleteCode: 'PA-2847',
      category: 'Youth',
      division: 'Clásico',
      ...PITBULL,
    },
  },
  {
    name: 'entrada-historia',
    label: 'Entrada de espectador · historia',
    props: {
      variant: 'ticket',
      format: 'story',
      athleteName: 'Camila Sosa',
      athleteCode: 'ENT-2026-0182',
      attendeeDocument: '40111222',
      dayPassLabel: 'Día 1 · 12 Dic',
      qrCode: 'tk_9f2a7c41b8e34d6fa0c1',
      ...PITBULL,
    },
  },
  {
    name: 'inscripcion-foto-historia',
    label: 'Inscripción con foto de perfil · historia',
    props: {
      variant: 'event',
      format: 'story',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      athletePhotoUrl: 'https://picsum.photos/seed/plu-athlete/400/400',
      category: 'Open',
      division: 'Equipado',
      ...PITBULL,
    },
  },
  {
    name: 'afiliacion-foto-post',
    label: 'Afiliación con foto de perfil · post',
    props: {
      variant: 'membership',
      format: 'square',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      athletePhotoUrl: 'https://picsum.photos/seed/plu-athlete/400/400',
      membershipSeason: '2026',
      membershipExpiration: '31 ene 2027',
    },
  },
  {
    name: 'foto-blanca-historia',
    label: 'Peor caso de contraste: foto blanca · historia',
    props: {
      variant: 'membership',
      format: 'story',
      athleteName: 'Martina Rivas',
      athleteCode: 'PLU-ARG-2026-001',
      athletePhotoUrl: WHITE_PHOTO,
      membershipSeason: '2026',
      membershipExpiration: '31 ene 2027',
    },
  },
  {
    name: 'foto-blanca-post',
    label: 'Peor caso de contraste: foto blanca · post',
    props: {
      variant: 'event',
      format: 'square',
      athleteName: 'Agustín Di Santo',
      athleteCode: 'PA-2847',
      athletePhotoUrl: WHITE_PHOTO,
      category: 'Youth',
      division: 'Clásico',
      ...PITBULL,
    },
  },
  {
    name: 'nombre-largo-historia',
    label: 'Nombre largo (clamp tipográfico) · historia',
    props: {
      variant: 'event',
      format: 'story',
      athleteName: 'María Fernanda Gutiérrez',
      athleteCode: 'PA-3110',
      category: 'Sub-Junior',
      division: 'Clásico',
      ...PITBULL,
    },
  },
]

const styles = {
  page: {
    minHeight: '100vh',
    background: '#101114',
    padding: '48px 32px 96px',
    fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  },
  header: { maxWidth: 1080, margin: '0 auto 40px', color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.6 },
  title: { color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px' },
  section: { maxWidth: 1080, margin: '0 auto 72px' },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    margin: '0 0 16px',
  },
}

function App() {
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Share card previews — PLU ARG</h1>
        <p style={{ margin: 0 }}>
          Página instrumental de diseño. Las cards se renderizan a tamaño real con el componente de
          producción; los PNGs versionados se generan con{' '}
          <code>npm run share-cards:previews</code> y quedan en <code>docs/share-card-previews/</code>.
        </p>
      </header>
      {FIXTURES.map((fixture) => (
        <section key={fixture.name} style={styles.section}>
          <p style={styles.label}>{fixture.label}</p>
          <div data-share-capture={fixture.name} style={{ display: 'inline-block' }}>
            <EventShareCard {...fixture.props} />
          </div>
        </section>
      ))}
    </main>
  )
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

window.__shareCardPreview = {
  names: FIXTURES.map((f) => f.name),
  expectedQrs: FIXTURES.length,
  /**
   * Rasteriza todas las cards con el pipeline real. scale 1 → tamaño
   * canónico de Instagram (1080×1080 / 1080×1920). En producción mobile
   * el servicio también usa scale 1; desktop fine-pointer usa scale 2.
   */
  async captureAll() {
    const results = []
    for (const fixture of FIXTURES) {
      const node = document.querySelector(`[data-share-capture="${fixture.name}"] .share-card`)
      if (!node) throw new Error(`share-card-preview: no se encontró la card "${fixture.name}"`)
      const blob = await generateEventCard(node, { scale: 1 })
      results.push({ name: fixture.name, dataUrl: await blobToDataUrl(blob) })
    }
    return results
  },
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
