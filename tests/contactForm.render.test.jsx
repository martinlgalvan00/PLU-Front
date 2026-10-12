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

  it('arma la carta del sobre con lo que se escribe y prepara el mail alternativo', () => {
    const { container } = renderForm()

    fireEvent.click(screen.getByRole('radio', { name: /Gimnasio/i }))
    fillRequiredFields()

    const letter = container.querySelector('.envelope__letter')
    expect(letter?.textContent).toContain('Gimnasio')
    expect(letter?.textContent).toContain('Quiero afiliarme para el próximo meet.')
    expect(letter?.textContent).toContain('Agustín')

    const href = screen
      .getByRole('link', { name: /prefiero escribir desde mi correo/i })
      .getAttribute('href')
    expect(href).toMatch(/^mailto:/)
    expect(decodeURIComponent(href)).toContain('Consulta (Gimnasio)')
    expect(decodeURIComponent(href)).toContain('Quiero afiliarme para el próximo meet.')
  })

  it('el sobre se sella mientras se envía y confirma cuando llega', async () => {
    let resolveSend
    vi.mocked(submitContactMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )
    const { container } = renderForm()
    const phase = () => container.querySelector('.letter-stage')?.getAttribute('data-phase')

    expect(phase()).toBe('idle')
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }))
    await waitFor(() => expect(phase()).toBe('sending'))

    resolveSend({ ok: true })
    await waitFor(() => expect(phase()).toBe('sent'))
    expect(await screen.findByText('Consulta enviada')).toBeTruthy()
  })

  it('si falla, el sobre se vuelve a abrir para reintentar', async () => {
    vi.mocked(submitContactMessage).mockRejectedValue(new Error('offline'))
    const { container } = renderForm()

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }))

    await screen.findByRole('alert')
    expect(container.querySelector('.letter-stage')?.getAttribute('data-phase')).toBe('error')
  })
})
