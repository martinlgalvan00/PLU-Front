import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/contactService.js', () => ({
  submitContactMessage: vi.fn(),
}))

const SponsorInquiryForm = (await import('../src/components/ui/SponsorInquiryForm.jsx')).default
const { submitContactMessage } = await import('../src/services/contactService.js')

function renderForm(props = {}) {
  return render(
    <I18nProvider>
      <SponsorInquiryForm {...props} />
    </I18nProvider>,
  )
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/marca o empresa/i), { target: { value: 'Marca SA' } })
  fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: 'Lucía' } })
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'lucia@marca.com' } })
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(submitContactMessage).mockReset()
})

describe('formulario de propuesta de sponsors', () => {
  it('manda la propuesta como motivo sponsor con marca, alcance y nivel en el mensaje', async () => {
    vi.mocked(submitContactMessage).mockResolvedValue({ ok: true })
    renderForm({ tier: 'title' })

    fillRequiredFields()
    fireEvent.click(screen.getByRole('radio', { name: /temporada completa/i }))
    fireEvent.click(screen.getByRole('button', { name: /enviar propuesta/i }))

    await waitFor(() => expect(submitContactMessage).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(submitContactMessage).mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'Lucía',
      email: 'lucia@marca.com',
      motive: 'sponsor',
    })
    expect(payload.message).toContain('Marca: Marca SA')
    expect(payload.message).toContain('Alcance: Temporada completa')
    expect(payload.message).toContain('Nivel de interés: Title sponsor')
    expect(await screen.findByText('Propuesta enviada')).toBeTruthy()
  })

  it('avisa el error, ofrece el mail alternativo y deja reintentar sin perder lo tipeado', async () => {
    vi.mocked(submitContactMessage).mockRejectedValue(new Error('offline'))
    renderForm()

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /enviar propuesta/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/no se pudo enviar/i)
    expect(screen.getByLabelText(/marca o empresa/i).value).toBe('Marca SA')
    expect(screen.getByRole('button', { name: /enviar propuesta/i }).disabled).toBe(false)
    expect(screen.getByRole('link', { name: /escribir por email/i }).getAttribute('href')).toMatch(
      /^mailto:/,
    )
  })

  it('avisa a la página cuando la marca cambia el nivel de interés', () => {
    const onTierChange = vi.fn()
    renderForm({ onTierChange })

    fireEvent.change(screen.getByLabelText(/nivel de interés/i), { target: { value: 'support' } })
    expect(onTierChange).toHaveBeenCalledWith('support')
  })
})
