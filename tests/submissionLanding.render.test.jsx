import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import SubmissionLandingPage from '../src/pages/SubmissionLandingPage.jsx'

const EVENT = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  description: 'El nuevo encuentro de fuerza de PLU ARG.',
  startsAt: '2027-03-06T10:00:00-03:00',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'proximamente',
  landing: { templateId: 'submission', phase: 'coming_soon', slots: {} },
}

const LOGO = 'https://cdn.example/barbell-logo.webp'

function renderLanding(event = EVENT, props = {}) {
  return render(
    <I18nProvider>
      <SubmissionLandingPage eventSlug={event.slug} events={[event]} {...props} />
    </I18nProvider>,
  )
}

function renderCover(event, props = {}) {
  return render(
    <MotionProvider>
      <I18nProvider>
        <SubmissionLandingPage eventSlug={event.slug} events={[event]} {...props} />
      </I18nProvider>
    </MotionProvider>,
  )
}

describe('SubmissionLandingPage', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.style.overflow = ''
  })

  it('muestra una landing completa aun cuando las inscripciones estan proximas', () => {
    renderLanding()
    expect(screen.getByRole('heading', { name: 'Barbell Submission' })).toBeTruthy()
    expect(screen.getAllByText('En preparación')).toHaveLength(2)
    expect(screen.getByText('Virtus Fitness')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'La experiencia' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Información de competencia' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver calendario' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
    expect(screen.getByText('Estamos armando esta página.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Armando la página' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sumar discos' })).toBeNull()
    expect(document.querySelector('[data-submission-logo-cover]')).toBeNull()
  })

  it('en preparacion deja inscribir si la venta esta abierta y ofrece el formulario', () => {
    const onSelectEvent = vi.fn()
    const view = renderLanding(
      {
        ...EVENT,
        status: 'inscripcion_abierta',
        externalForm: { url: 'https://forms.gle/barbell', label: 'Anotarme' },
      },
      { onSelectEvent },
    )
    const scope = within(view.container)
    expect(scope.getByText('La inscripción ya está abierta.')).toBeTruthy()
    expect(scope.queryByText('Estamos armando esta página.')).toBeNull()
    expect(scope.getByRole('img', { name: 'Inscripción abierta' })).toBeTruthy()
    fireEvent.click(scope.getAllByRole('button', { name: 'Inscribirme' })[0])
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ slug: EVENT.slug }))
    expect(
      scope.getByRole('heading', { name: 'Estamos construyendo la página oficial del torneo.' }),
    ).toBeTruthy()
    const formLinks = scope.getAllByRole('link', { name: 'Anotarme' })
    expect(formLinks.length).toBeGreaterThan(0)
    expect(formLinks.every((link) => link.getAttribute('href') === 'https://forms.gle/barbell')).toBe(
      true,
    )
  })

  it('en preparacion con inscripcion abierta cruza el logo del evento con el de PLU', () => {
    const view = renderLanding({
      ...EVENT,
      status: 'inscripcion_abierta',
      logoUrl: LOGO,
      landing: {
        templateId: 'submission',
        phase: 'coming_soon',
        slots: {},
        layout: { motion: 'none' },
      },
    })
    const scope = within(view.container)
    expect(
      scope.getByRole('heading', { name: 'Estamos construyendo la página oficial del torneo.' }),
    ).toBeTruthy()
    expect(scope.getAllByRole('img', { name: 'Logo de Barbell Submission' })).toHaveLength(2)
    const plu = scope.getByRole('img', { name: 'PLU Argentina — emblema oficial' })
    expect(plu.getAttribute('src')).toBe('/brand/plu-argentina-apple-touch.png')
    expect(scope.getByText('×')).toBeTruthy()
  })

  it('en publicada habilita el CTA de inscripcion cuando el evento esta abierto', () => {
    const onSelectEvent = vi.fn()
    const view = renderLanding(
      {
        ...EVENT,
        status: 'inscripcion_abierta',
        landing: { templateId: 'submission', phase: 'published', slots: { ctaLabel: 'Competir' } },
      },
      { onSelectEvent },
    )
    const buttons = within(view.container).getAllByRole('button', { name: 'Competir' })
    expect(buttons.length).toBeGreaterThan(1)
    fireEvent.click(buttons[0])
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ slug: EVENT.slug }))
    expect(within(view.container).queryByRole('button', { name: 'Sumar discos' })).toBeNull()
    expect(
      within(view.container).queryByRole('heading', {
        name: 'Estamos construyendo la página oficial del torneo.',
      }),
    ).toBeNull()
    expect(within(view.container).queryByRole('img', { name: 'PLU Argentina — emblema oficial' })).toBeNull()
  })

  it('publicada sin foto propia no usa una imagen de otro evento y muestra los datos en la portada', () => {
    const view = renderLanding({
      ...EVENT,
      status: 'inscripcion_abierta',
      logoUrl: LOGO,
      landing: {
        templateId: 'submission',
        phase: 'published',
        slots: {},
        layout: { motion: 'none' },
      },
    })
    const hero = view.container.querySelector('.submission-landing__hero')
    expect(hero.dataset.hero).toBe('stage')
    // Antes caía en una foto de medallas de Pitbull Classic.
    expect(hero.querySelector('.submission-landing__hero-image')).toBeNull()
    expect(hero.querySelector('.submission-landing__emblem img').getAttribute('src')).toBe(LOGO)
    const band = within(hero.querySelector('.submission-landing__band'))
    expect(band.getByText('Virtus Fitness')).toBeTruthy()
    expect(band.getByText('Berazategui')).toBeTruthy()
    expect(within(hero).getByRole('status').textContent).toMatch(/inscripción abierta/i)
    // La bajada vive en la portada y no se repite como texto de "El evento".
    expect(screen.getAllByText(EVENT.description)).toHaveLength(1)
  })

  it('con foto propia la usa de fondo', () => {
    const view = renderLanding({
      ...EVENT,
      heroImageUrl: 'https://cdn.example/hero.webp',
      landing: { templateId: 'submission', phase: 'published', slots: {} },
    })
    const hero = view.container.querySelector('.submission-landing__hero')
    expect(hero.dataset.hero).toBe('photo')
    expect(hero.querySelector('.submission-landing__hero-image').getAttribute('src')).toBe(
      'https://cdn.example/hero.webp',
    )
  })

  it('con logo muestra la portada y reserva el lugar del logo en el hero', () => {
    const view = renderCover({ ...EVENT, logoUrl: LOGO })
    const cover = document.querySelector('[data-submission-logo-cover]')
    expect(cover).toBeTruthy()
    expect(cover.querySelector('img').getAttribute('src')).toBe(LOGO)
    expect(cover.querySelector('img').getAttribute('alt')).toBe('')
    expect(cover.getAttribute('aria-hidden')).toBe('true')
    const main = view.container.querySelector('main')
    expect(main.getAttribute('data-skip-route-morph')).toBe('')
    expect(main.classList.contains('submission-landing--logo-cover')).toBe(true)
    expect(screen.getAllByRole('img', { name: 'Logo de Barbell Submission' })).toHaveLength(2)
  })

  it('el clic o Escape salta la portada y deja el logo del hero', () => {
    const view = renderCover({ ...EVENT, logoUrl: LOGO })
    fireEvent.click(document.querySelector('[data-submission-logo-cover]'))
    const main = view.container.querySelector('main')
    expect(document.querySelector('[data-submission-logo-cover]')).toBeNull()
    expect(main.hasAttribute('data-skip-route-morph')).toBe(false)
    expect(main.classList.contains('submission-landing--logo-cover')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('')
    view.unmount()

    const again = renderCover({ ...EVENT, logoUrl: LOGO })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-submission-logo-cover]')).toBeNull()
    again.unmount()
  })

  it('sin animacion o con movimiento reducido no tapa la pagina', () => {
    const still = renderLanding({
      ...EVENT,
      logoUrl: LOGO,
      landing: {
        templateId: 'submission',
        phase: 'coming_soon',
        slots: {},
        layout: { motion: 'none' },
      },
    })
    expect(still.container.querySelector('main').getAttribute('data-motion')).toBe('none')
    expect(document.querySelector('[data-submission-logo-cover]')).toBeNull()
    expect(still.container.querySelector('main').hasAttribute('data-skip-route-morph')).toBe(false)
    still.unmount()

    const original = window.matchMedia
    window.matchMedia = (query) => ({
      matches: String(query).includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })
    try {
      const reduced = renderLanding({ ...EVENT, logoUrl: LOGO })
      expect(document.querySelector('[data-submission-logo-cover]')).toBeNull()
      expect(reduced.container.querySelector('main').hasAttribute('data-skip-route-morph')).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })
})
