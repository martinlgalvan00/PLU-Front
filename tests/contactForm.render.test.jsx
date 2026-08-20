import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/contactService.js', () => ({
  submitContactMessage: vi.fn(),
}))

const ContactForm = (await import('../src/components/ui/ContactForm.jsx')).default
const { submitContactMessage } = await import('../src/services/contactService.js')

function renderForm() {
  return render(
    <I18nProvider>
      <ContactForm />
    </I18nProvider>,
  )
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Agustín' } })
  fireEvent.change(screen.getByLabelText(/^Email$/i), {
    target: { value: 'agus@example.com' },
  })
  fireEvent.change(screen.getByLabelText(/^Mensaje$/i), {
    target: { value: 'Quiero afiliarme para el próximo meet.' },
  })
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(submitContactMessage).mockReset()
})

describe('formulario de contacto', () => {
  it('manda los datos tipeados y el motivo elegido, y muestra la confirmación', async () => {
    vi.mocked(submitContactMessage).mockResolvedValue({ ok: true })
    renderForm()

    fireEvent.click(screen.getByRole('radio', { name: /Gimnasio/i }))
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }))

    await waitFor(() =>
      expect(submitContactMessage).toHaveBeenCalledWith({
        name: 'Agustín',
        email: 'agus@example.com',
        message: 'Quiero afiliarme para el próximo meet.',
        motive: 'gimnasio',
      }),
    )
    expect(await screen.findByText('Consulta enviada')).toBeTruthy()
  })

  it('avisa el error y deja reintentar sin perder lo tipeado', async () => {
    vi.mocked(submitContactMessage).mockRejectedValue(new Error('offline'))
    renderForm()

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/no se pudo enviar/i)
    expect(screen.getByLabelText(/^Nombre$/i).value).toBe('Agustín')
    expect(screen.getByRole('button', { name: /Enviar/i }).disabled).toBe(false)
  })
})
