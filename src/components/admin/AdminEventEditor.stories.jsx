import { useState } from 'react'
import AdminEventEditor from './AdminEventEditor.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'
import { buildAdminEventDraft, createAdminEventDraft } from '../../services/eventAdminService.js'

/**
 * Alta completa de un evento (sin id) dentro del shell real: el modal se
 * portalea a <body>, así que detrás va el panel que se ve en la app.
 */

export default {
  title: 'Admin/Editor de evento',
  parameters: { layout: 'fullscreen' },
}

function Screen() {
  const [draft, setDraft] = useState(createAdminEventDraft)
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-nuevo' } })}
      />
    </AdminPreviewShell>
  )
}

export const AltaCompleta = { render: () => <Screen /> }

const EXISTING = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus Fitness',
  location: 'Berazategui / Buenos Aires',
  status: 'proximamente',
  slots: 180,
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  pricing: { membership: 75000, registration: 75000, combo: 120000 },
}

function EditScreen({ onSubmit }) {
  const [draft, setDraft] = useState(() => buildAdminEventDraft(EXISTING))
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={onSubmit}
      />
    </AdminPreviewShell>
  )
}

/**
 * Editar y guardar: el rechazo del servidor marca el campo que falta y el panel
 * ofrece ir ahí. Cambiá el título y guardá para verlo.
 */
export const GuardadoRechazado = {
  render: () => (
    <EditScreen
      onSubmit={async () => {
        const error = new Error(
          'La transferencia está abierta para este evento pero no tiene a dónde cobrar.',
        )
        error.status = 400
        error.body = { fields: { bankTransferProfileId: 'Falta el destino de cobro.' } }
        throw error
      }}
    />
  ),
}

/** Se guarda, pero el cobro queda incompleto: aviso con salto, sin marcarlo como error. */
export const GuardadoConAviso = {
  render: () => (
    <EditScreen
      onSubmit={async () => ({
        warnings: [
          {
            code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED',
            message: 'La transferencia está abierta para este evento pero no tiene a dónde cobrar.',
            field: 'bankTransferProfileId',
          },
        ],
      })}
    />
  ),
}

function CashScreen() {
  const [draft, setDraft] = useState(() =>
    buildAdminEventDraft({
      ...EXISTING,
      paymentChannelOverrides: {
        registration: { cash_pitbull: 'open' },
        ticket: { cash_pitbull: 'open' },
      },
    }),
  )
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-1' } })}
      />
    </AdminPreviewShell>
  )
}

/**
 * Efectivo en el lugar: con el canal abierto aparece dónde se paga. Vacío usa
 * la sede del evento; abrí Ventas → Cobro para verlo.
 */
export const CobroEfectivo = { render: () => <CashScreen /> }

function LandingScreen() {
  const [draft, setDraft] = useState(() =>
    buildAdminEventDraft({
      ...EXISTING,
      landing: {
        templateId: 'editorial',
        slots: {
          experienceTitle: 'Jueces y equipo',
          experienceBody: 'Jueces internacionales, speaker y transmisión en vivo.',
        },
      },
      publicSurface: { recentRegistrants: false, tickets: false },
    }),
  )
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        initialFocus="visibility"
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-1' } })}
      />
    </AdminPreviewShell>
  )
}

/**
 * Landing por secciones: cada bloque con su interruptor y sus textos juntos.
 * Acá "Últimos inscriptos" y "Entradas" están ocultos; "Experiencia" tiene
 * textos propios.
 */
export const LandingPorSecciones = { render: () => <LandingScreen /> }

function BuilderScreen() {
  const [draft, setDraft] = useState(() =>
    buildAdminEventDraft({
      ...EXISTING,
      landing: {
        templateId: 'builder',
        publicVisible: false,
        slots: { heroTitle: 'Barbell Submission', experienceTitle: 'Jueces y equipo' },
        layout: {
          palette: { accent: '#ff8800', action: '#f5c518', background: '#101820' },
          blocks: [
            { id: 'hero', type: 'hero' },
            { id: 'facts', type: 'facts' },
            { id: 'text-1', type: 'text', props: { title: 'Cómo se compite', body: 'Tres intentos por movimiento.' } },
            { id: 'experience', type: 'experience' },
            { id: 'faq', type: 'faq', visible: false },
            { id: 'cta-1', type: 'cta', props: { label: 'Leer reglamento', href: 'https://plu.com.ar/reglamento' } },
          ],
        },
      },
    }),
  )
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        initialFocus="visibility"
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-1' } })}
      />
    </AdminPreviewShell>
  )
}

/** Constructor: bloques ordenables, colores propios y la landing apagada ("en construcción"). */
export const LandingConstructor = { render: () => <BuilderScreen /> }
