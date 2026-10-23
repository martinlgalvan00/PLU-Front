import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventLandingSection from '../src/components/admin/event-editor/EventLandingSection.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'
import {
  clearLandingStudioReopen,
  shouldReopenLandingStudio,
} from '../src/lib/landingStudioSession.js'

/**
 * Editor visual de la landing: se abre desde la sección, edita el mismo
 * borrador, elige bloques desde la vista previa, deshace y sobrevive al guardado.
 */

afterEach(() => {
  cleanup()
  clearLandingStudioReopen()
})

const SLOW = { timeout: 15000 }

const EVENT = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'proximamente',
  published: true,
  slots: 180,
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  landing: {
    templateId: 'builder',
    publicVisible: true,
    slots: { heroTitle: 'Barbell Submission' },
    layout: {
      blocks: [
        { id: 'hero', type: 'hero' },
        { id: 'facts', type: 'facts' },
        { id: 'text-1', type: 'text', props: { title: 'Cómo se compite', body: 'Tres intentos.' } },
        {
          id: 'cta-1',
          type: 'cta',
          props: { title: 'Reglamento', label: 'Leer', href: 'https://plu.com.ar/reglamento' },
        },
      ],
    },
  },
}

let latestDraft = null

function Section({ onSave }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(() => buildAdminEventDraft(EVENT))
  latestDraft = draft
  return (
    <EventLandingSection
      canEdit
      draft={draft}
      err={() => null}
      patchDraft={setDraft}
      sourceEvent={EVENT}
      studioSave={{ onSave, dirty: true, syncing: false, error: null }}
      t={t}
    />
  )
}

function renderSection({ onSave = vi.fn() } = {}) {
  return render(
    <I18nProvider>
      <Section onSave={onSave} />
    </I18nProvider>,
  )
}

const order = () =>
  [...document.querySelectorAll('.admin-landing-studio .admin-landing-blocks__item')].map(
    (row) => row.dataset.block,
  )
const frameDoc = () => document.querySelector('.admin-landing-studio__frame').contentDocument

async function openStudio() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir editor visual' }))
  const dialog = await screen.findByRole('dialog', { name: 'Editor visual de la landing' }, SLOW)
  await within(frameDoc().body).findByRole('heading', { name: 'Barbell Submission' }, SLOW)
  return dialog
}

describe('Editor visual de la landing', { timeout: 30000 }, () => {
  it('se abre a pantalla completa con la landing real en la vista previa', async () => {
    renderSection()
    const dialog = await openStudio()
    expect(within(dialog).getByRole('tab', { name: 'Contenido' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(order()).toEqual(['hero', 'facts', 'text-1', 'cta-1'])
  })

  it('un clic en un bloque de la vista previa lo elige y enfoca su primer campo', async () => {
    renderSection()
    await openStudio()
    const block = frameDoc().getElementById('bloque-cta-1')
    fireEvent.click(within(block).getByRole('link', { name: 'Leer' }))

    const row = document.querySelector('.admin-landing-studio [data-block="cta-1"]')
    await waitFor(() => expect(row.classList.contains('is-selected')).toBe(true))
    expect(row.contains(document.activeElement)).toBe(true)
    expect(document.activeElement.value).toBe('Reglamento')
  })

  it('un bloque nuevo se agrega debajo del elegido, no al final', async () => {
    renderSection()
    const dialog = await openStudio()
    fireEvent.click(frameDoc().getElementById('bloque-facts'))
    await waitFor(() =>
      expect(
        document.querySelector('.admin-landing-studio [data-block="facts"]').classList.contains('is-selected'),
      ).toBe(true),
    )
    fireEvent.click(
      within(within(dialog).getByRole('group', { name: 'Agregar un bloque propio' })).getByRole(
        'button',
        { name: 'Texto' },
      ),
    )
    expect(order()).toEqual(['hero', 'facts', 'text-2', 'text-1', 'cta-1'])
  })

  it('"Qué ve el público" cambia el borrador y Deshacer lo repone', async () => {
    renderSection()
    const dialog = await openStudio()
    fireEvent.click(within(dialog).getByRole('button', { name: 'En construcción' }))
    expect(latestDraft.landing.publicVisible).toBe(false)
    expect(within(dialog).getByText(/El público ve el cartel de construcción/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deshacer' }))
    expect(latestDraft.landing.publicVisible).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rehacer' }))
    expect(latestDraft.landing.publicVisible).toBe(false)
  })

  it('Ctrl+Z fuera de un campo de texto deshace; dentro del campo no lo intercepta', async () => {
    renderSection()
    const dialog = await openStudio()
    fireEvent.click(within(dialog).getByRole('button', { name: 'En construcción' }))

    const input = within(dialog).getAllByRole('textbox')[0]
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(latestDraft.landing.publicVisible).toBe(false)

    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Listo' }), { key: 'z', ctrlKey: true })
    expect(latestDraft.landing.publicVisible).toBe(true)
  })

  it('Guardar usa el guardado del evento y deja marcado reabrir el editor', async () => {
    const onSave = vi.fn()
    renderSection({ onSave })
    const dialog = await openStudio()
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(shouldReopenLandingStudio('evt-1')).toBe(true)
  })

  it('después de guardar, el editor que se vuelve a armar abre el visual solo', async () => {
    const onSave = vi.fn()
    const { unmount } = renderSection({ onSave })
    const dialog = await openStudio()
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }))
    // El padre desmonta y vuelve a montar el editor con lo que devolvió el servidor.
    unmount()
    renderSection()
    expect(
      await screen.findByRole('dialog', { name: 'Editor visual de la landing' }, SLOW),
    ).toBeTruthy()
    // Una vez abierto, la marca se limpia: no se vuelve a abrir solo más tarde.
    expect(shouldReopenLandingStudio('evt-1')).toBe(false)
  })

  it('Escape y "Listo" lo cierran sin perder lo editado', async () => {
    renderSection()
    const dialog = await openStudio()
    fireEvent.click(within(dialog).getByRole('button', { name: 'En construcción' }))
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog', { name: 'Editor visual de la landing' })).toBeNull()
    expect(latestDraft.landing.publicVisible).toBe(false)
  })
})
