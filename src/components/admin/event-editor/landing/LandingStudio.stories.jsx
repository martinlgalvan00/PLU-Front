import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { useI18n } from '../../../../i18n/I18nProvider.jsx'
import { AdminPreviewShell } from '../../../../pages/admin/adminPreviewShell.jsx'
import { buildAdminEventDraft } from '../../../../services/eventAdminService.js'
import LandingStudio from './LandingStudio.jsx'

/**
 * Editor visual de la landing a pantalla completa, con el mismo borrador que
 * usa el formulario del evento. El guardado se simula: marca "sin cambios" al
 * terminar, como el editor real cuando vuelve del servidor.
 */
export default {
  title: 'Admin/Editor de evento/Editor visual',
  parameters: { layout: 'fullscreen' },
}

const EVENT = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus Fitness',
  location: 'Berazategui, Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  slots: 180,
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  pricing: { membership: 75000, registration: 75000, combo: 120000 },
}

function builderLanding(overrides = {}) {
  return {
    templateId: 'builder',
    publicVisible: true,
    slots: {
      heroTitle: 'Barbell Submission',
      heroLead: 'Una jornada de powerlifting con el estándar PLU ARG.',
      experienceTitle: 'Jueces y equipo técnico',
      experienceBody:
        'Jueces internacionales, speaker y transmisión en vivo durante toda la jornada.',
    },
    layout: {
      blocks: [
        { id: 'hero', type: 'hero' },
        { id: 'facts', type: 'facts' },
        {
          id: 'text-1',
          type: 'text',
          props: {
            eyebrow: 'Formato',
            title: 'Cómo se compite',
            body: 'Tres intentos por movimiento, jueces internacionales y un estándar único para todas las divisiones.',
          },
        },
        { id: 'experience', type: 'experience' },
        { id: 'faq', type: 'faq', visible: false },
        {
          id: 'cta-1',
          type: 'cta',
          props: {
            title: 'Reglamento oficial',
            body: 'Leelo antes de inscribirte.',
            label: 'Leer reglamento',
            href: 'https://plu.com.ar/reglamento',
          },
        },
      ],
    },
    ...overrides,
  }
}

function Studio({ landing }) {
  const { t } = useI18n()
  const source = { ...EVENT, landing }
  const [draft, setDraft] = useState(() => buildAdminEventDraft(source))
  const [saved, setSaved] = useState(draft)
  const [open, setOpen] = useState(true)
  if (!open) return <p style={{ padding: 24 }}>Cerrado. Recargá la story para abrirlo otra vez.</p>
  // Detrás, el panel real: el editor visual se portalea a <body> encima de él.
  return (
    <AdminPreviewShell section="events">
      <LandingStudio
        canEdit
        draft={draft}
        err={() => null}
        patchDraft={setDraft}
        save={{
          onSave: () => setSaved(draft),
          dirty: draft !== saved,
          syncing: false,
          error: null,
        }}
        sourceEvent={source}
        t={t}
        onClose={() => setOpen(false)}
      />
    </AdminPreviewShell>
  )
}

export const Constructor = {
  render: () => <Studio landing={builderLanding()} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog', { name: /Editor visual de la landing/i })
    await expect(within(dialog).getByRole('tab', { name: 'Contenido' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // Cambiar un texto habilita guardar y deshacer.
    const title = within(dialog)
      .getAllByRole('textbox')
      .find((input) => input.value === 'Cómo se compite')
    await userEvent.type(title, ' en PLU')
    await expect(within(dialog).getByRole('button', { name: 'Deshacer' })).toBeEnabled()
    await expect(within(dialog).getByRole('button', { name: /Guardar cambios/ })).toBeEnabled()
  },
}

/** Publicado pero en construcción: se edita la página y el cartel se ve a pedido. */
export const EnConstruccion = {
  render: () => <Studio landing={builderLanding({ publicVisible: false })} />,
}

/** Plantilla fija: misma vista previa en vivo, con el orden de la plantilla. */
export const PlantillaEditorial = {
  render: () => (
    <Studio
      landing={{
        templateId: 'editorial',
        publicVisible: true,
        slots: { heroTitle: 'Pitbull Classic 2026', experienceTitle: 'La experiencia' },
      }}
    />
  ),
}
