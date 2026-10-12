import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * "Próximamente" de la tienda: promete sólo el aviso por correo. Se fija que
 * cada sección diga lo suyo, que el correo se valide antes de molestar a la API
 * y que el aviso de catálogo desactualizado no tape la invitación.
 */

const registerLaunchInterest = vi.fn()
vi.mock('../src/services/launchInterestService.js', () => ({
  registerLaunchInterest: (...args) => registerLaunchInterest(...args),
}))

const ShopComingSoon = (await import('../src/components/ui/ShopComingSoon.jsx')).default
const LaunchInterestForm = (await import('../src/components/ui/LaunchInterestForm.jsx')).default

const t = (key) => key
const renderSoon = (props = {}) =>
  render(
    <I18nProvider>
      <ShopComingSoon tab="apparel" stale={false} onRetry={() => {}} t={t} {...props} />
    </I18nProvider>,
  )

beforeEach(() => {
  registerLaunchInterest.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShopComingSoon', () => {
  it.each(['apparel', 'exclusive', 'course'])('muestra el texto propio de %s', (tab) => {
    renderSoon({ tab })
    expect(screen.getByText(`pages.shop.catalog.soon.${tab}.title`)).toBeTruthy()
    expect(screen.getByText(`pages.shop.catalog.soon.${tab}.text`)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('el formulario viaja con la sección como fuente del aviso', async () => {
    registerLaunchInterest.mockResolvedValue({})
    renderSoon({ tab: 'course' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ana@correo.com' } })
    fireEvent.submit(screen.getByRole('textbox').closest('form'))

    await waitFor(() => expect(registerLaunchInterest).toHaveBeenCalled())
    expect(registerLaunchInterest).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@correo.com', source: 'shop_course' }),
    )
  })

  it('con el catálogo desactualizado avisa y deja reintentar sin tapar la invitación', () => {
    const onRetry = vi.fn()
    renderSoon({ stale: true, onRetry })

    expect(screen.getByRole('status').textContent).toMatch(/staleNote/)
    fireEvent.click(screen.getByRole('button', { name: /retry/ }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('sin el aviso de desactualizado no muestra el estado', () => {
    renderSoon({ stale: false })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('LaunchInterestForm', () => {
  const renderForm = () =>
    render(
      <I18nProvider>
        <LaunchInterestForm source="shop_hero" eventSlug="pitbull-classic-2026" />
      </I18nProvider>,
    )
  const submitWith = (value) => {
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value } })
    fireEvent.submit(input.closest('form'))
  }

  it('un correo inválido se frena en el cliente, sin llamar a la API', () => {
    renderForm()
    submitWith('no-es-un-mail')

    expect(registerLaunchInterest).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/correo válido/i)
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  })

  it('el error se despeja al volver a escribir', () => {
    renderForm()
    submitWith('x')
    expect(screen.getByRole('alert')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ana@' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('recorta espacios y manda el evento junto con el correo', async () => {
    registerLaunchInterest.mockResolvedValue({})
    renderForm()
    submitWith('  ana@correo.com  ')

    await waitFor(() => expect(registerLaunchInterest).toHaveBeenCalled())
    expect(registerLaunchInterest).toHaveBeenCalledWith({
      email: 'ana@correo.com',
      source: 'shop_hero',
      eventSlug: 'pitbull-classic-2026',
    })
    expect((await screen.findByRole('status')).textContent).toMatch(/Anotado/)
  })

  it('si la API falla lo dice y deja reintentar con el correo escrito', async () => {
    registerLaunchInterest.mockRejectedValue(new Error('boom'))
    renderForm()
    submitWith('ana@correo.com')

    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos registrar/i)
    expect(screen.getByRole('textbox').value).toBe('ana@correo.com')
    expect(screen.getByRole('button').disabled).toBe(false)
  })
})
