import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/lib/credentialQr.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generateCredentialQr: vi.fn(async (url) => `data:image/png;base64,QR-${url.length}`),
}))

const { generateCredentialQr } = await import('../src/lib/credentialQr.js')
const { default: EventExternalFormField } = await import(
  '../src/components/admin/event-editor/EventExternalFormField.jsx'
)
const { validateAdminEventDraft } = await import('../src/lib/schemas/adminEvent.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const VALID_URL = 'https://forms.gle/AbC123xyz'

function renderField({ externalForm = { url: '', label: '' }, canEdit = true, error = '' } = {}) {
  const patchDraft = vi.fn()
  const draft = { externalForm }
  render(
    <I18nProvider>
      <EventExternalFormField
        canEdit={canEdit}
        draft={draft}
        err={(key) => (key === 'externalForm.url' ? error : '')}
        patchDraft={patchDraft}
      />
    </I18nProvider>,
  )
  return { patchDraft, draft }
}

describe('EventExternalFormField', () => {
  it('sin formulario cargado explica qué hace y no muestra QR', () => {
    renderField()
    expect(screen.getByLabelText(/link del formulario de google/i)).toBeTruthy()
    expect(screen.queryByRole('img', { name: /código qr/i })).toBeNull()
    expect(generateCredentialQr).not.toHaveBeenCalled()
  })

  it('con un link válido genera el QR y ofrece descargarlo y copiar el link', async () => {
    renderField({ externalForm: { url: VALID_URL, label: 'Encuesta' } })
    expect(await screen.findByRole('img', { name: /código qr/i })).toBeTruthy()
    expect(generateCredentialQr).toHaveBeenCalledWith(VALID_URL)
    expect(screen.getByRole('button', { name: /descargar qr/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /copiar link/i })).toBeTruthy()
  })

  it('un link que no es de Google Forms no genera QR y muestra el motivo', () => {
    renderField({
      externalForm: { url: 'https://evil.example/x', label: '' },
      error: 'El formulario debe ser un link https de Google Forms.',
    })
    expect(screen.getByText(/link https de google forms/i)).toBeTruthy()
    expect(generateCredentialQr).not.toHaveBeenCalled()
  })

  it('escribir el link actualiza el borrador sin tocar la etiqueta', () => {
    const { patchDraft } = renderField({ externalForm: { url: '', label: 'Encuesta' } })
    fireEvent.change(screen.getByLabelText(/link del formulario de google/i), {
      target: { value: VALID_URL },
    })
    expect(patchDraft).toHaveBeenCalledWith({
      externalForm: { url: VALID_URL, label: 'Encuesta' },
    })
  })

  it('el texto del botón se edita aparte', () => {
    const { patchDraft } = renderField({ externalForm: { url: VALID_URL, label: '' } })
    fireEvent.change(screen.getByLabelText(/texto del botón/i), { target: { value: 'Sumate' } })
    expect(patchDraft).toHaveBeenCalledWith({ externalForm: { url: VALID_URL, label: 'Sumate' } })
  })

  it('sin permiso de edición los campos quedan bloqueados', () => {
    renderField({ externalForm: { url: VALID_URL, label: '' }, canEdit: false })
    expect(screen.getByLabelText(/link del formulario de google/i).disabled).toBe(true)
    expect(screen.getByLabelText(/texto del botón/i).disabled).toBe(true)
  })

  it('descargar baja el PNG con un nombre legible', async () => {
    renderField({ externalForm: { url: VALID_URL, label: 'Encuesta' } })
    await screen.findByRole('img', { name: /código qr/i })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /descargar qr/i }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    click.mockRestore()
  })
})

describe('validación del borrador con formulario externo', () => {
  const base = {
    title: 'Pitbull Classic',
    slug: 'pitbull-classic-2026',
    venue: 'Sede',
    location: 'CABA',
    startsAt: '2026-08-15T09:00',
    endsAt: '2026-08-15T20:00',
    status: 'proximamente',
    slots: 120,
    pricing: { registration: 75000 },
  }
  const t = (key) => key

  it('acepta un link de Google Forms o vacío', () => {
    for (const url of [VALID_URL, '']) {
      const { fieldErrors } = validateAdminEventDraft({ ...base, externalForm: { url, label: '' } }, t)
      expect(Object.keys(fieldErrors)).not.toContain('externalForm.url')
    }
  })

  it('rechaza cualquier otro link con un error en el campo', () => {
    const result = validateAdminEventDraft(
      { ...base, externalForm: { url: 'https://evil.example/x', label: '' } },
      t,
    )
    expect(result.ok).toBe(false)
    expect(result.fieldErrors['externalForm.url']).toBe('admin.eventEditor.validation.externalFormInvalid')
  })
})
