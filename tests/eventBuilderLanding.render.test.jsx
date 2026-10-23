import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventBuilderLandingPage, { isLandingBlockShown } from '../src/pages/EventBuilderLandingPage.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { normalizeEventLanding } from '../src/lib/eventLanding.js'

// La regla real depende de la configuración de la plataforma (ver eventPublicActions.test.js):
// acá se fija para probar qué hace la portada con cada respuesta.
const actions = vi.hoisted(() => ({
  isEventRegistrationOpen: vi.fn(),
  canBuyEventTickets: vi.fn(),
}))
vi.mock('../src/lib/eventPublicActions.js', () => actions)

vi.mock('../src/hooks/usePublicEventSchedule.js', () => ({
  usePublicEventSchedule: () => ({ schedule: { hasContent: false }, updatedAt: null }),
}))
vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: () => ({ recent: [], status: 'ready' }),
}))

afterEach(cleanup)

const BASE = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  description: 'El nuevo encuentro de fuerza.',
  startsAt: '2027-03-06T10:00:00-03:00',
  endsAt: '2027-03-06T20:00:00-03:00',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'proximamente',
  published: true,
}

function eventWith(landing, extra = {}) {
  return {
    ...BASE,
    ...extra,
    landing: normalizeEventLanding({ templateId: 'builder', publicVisible: true, ...landing }),
  }
}

function renderPage(event, props = {}) {
  return render(
    <I18nProvider>
      <EventBuilderLandingPage eventSlug={event.slug} events={[event]} {...props} />
    </I18nProvider>,
  )
}

const order = (container) =>
  [...container.querySelectorAll('[id^="bloque-"]')].map((node) => node.id.replace('bloque-', ''))

describe('EventBuilderLandingPage', () => {
  it('dibuja los bloques en el orden del layout', () => {
    const event = eventWith({
      slots: { experienceTitle: 'Jueces', experienceBody: 'Equipo técnico.' },
      layout: {
        blocks: [
          { id: 'hero', type: 'hero' },
          { id: 'text-1', type: 'text', props: { title: 'Antes de nada', body: 'Hola' } },
          { id: 'facts', type: 'facts' },
          { id: 'experience', type: 'experience' },
        ],
      },
    })
    const { container } = renderPage(event)
    expect(order(container)).toEqual(['hero', 'text-1', 'facts', 'experience'])
  })

  it('cambiar el orden cambia la página', () => {
    const blocks = [
      { id: 'hero', type: 'hero' },
      { id: 'experience', type: 'experience' },
      { id: 'facts', type: 'facts' },
    ]
    const slots = { experienceTitle: 'Jueces', experienceBody: 'Equipo.' }
    const a = renderPage(eventWith({ slots, layout: { blocks } }))
    expect(order(a.container)).toEqual(['hero', 'experience', 'facts'])
    cleanup()
    const b = renderPage(eventWith({ slots, layout: { blocks: [blocks[0], blocks[2], blocks[1]] } }))
    expect(order(b.container)).toEqual(['hero', 'facts', 'experience'])
  })

  it('un bloque oculto no se dibuja', () => {
    const event = eventWith({
      layout: {
        blocks: [
          { id: 'hero', type: 'hero' },
          { id: 'facts', type: 'facts', visible: false },
        ],
      },
    })
    const { container } = renderPage(event)
    expect(order(container)).toEqual(['hero'])
    expect(screen.queryByText('Virtus Fitness')).toBeNull()
  })

  it('respeta también el switch del módulo público', () => {
    const block = { id: 'faq', type: 'faq', visible: true }
    expect(isLandingBlockShown(block, { faq: true })).toBe(true)
    expect(isLandingBlockShown(block, { faq: false })).toBe(false)
    expect(isLandingBlockShown({ ...block, visible: false }, { faq: true })).toBe(false)
    // Un bloque propio no depende de publicSurface.
    expect(isLandingBlockShown({ id: 'text-1', type: 'text', visible: true }, { faq: false })).toBe(true)
  })

  it('los bloques sin contenido no dejan huecos', () => {
    const { container } = renderPage(eventWith({}))
    // Sin textos de experiencia/categorías/FAQ ni grilla: solo lo que tiene datos.
    const ids = order(container)
    expect(ids).toContain('hero')
    expect(ids).toContain('facts')
    expect(ids).not.toContain('experience')
    expect(ids).not.toContain('faq')
    expect(ids).not.toContain('schedule')
  })

  it('el hero muestra título propio y un solo h1', () => {
    renderPage(eventWith({ slots: { heroTitle: 'Título del evento', heroLead: 'Bajada propia' } }))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Título del evento' })).toBeTruthy()
    expect(screen.getByText('Bajada propia')).toBeTruthy()
  })

  it('aplica la paleta del evento como variables CSS', () => {
    const event = eventWith({
      layout: { palette: { accent: '#ff8800', action: '#f5c518', background: '#101820' } },
    })
    const { container } = renderPage(event)
    const main = container.querySelector('main')
    expect(main.style.getPropertyValue('--event-accent')).toBe('#ff8800')
    expect(main.style.getPropertyValue('--event-action')).toBe('#f5c518')
    expect(main.style.getPropertyValue('--event-action-text')).toBe('#14181f')
    expect(main.style.getPropertyValue('--color-bg')).toBe('#101820')
    expect(main.style.getPropertyValue('--color-text')).toBe('#ffffff')
  })

  it('marca el preset de animaciones en el <main>: suave por defecto', () => {
    const { container, rerender } = renderPage(eventWith({}))
    expect(container.querySelector('main').dataset.motion).toBe('soft')

    const bold = eventWith({ layout: { blocks: [], motion: 'bold' } })
    rerender(
      <I18nProvider>
        <EventBuilderLandingPage eventSlug={bold.slug} events={[bold]} />
      </I18nProvider>,
    )
    expect(container.querySelector('main').dataset.motion).toBe('bold')
  })

  it('sin sus animaciones el contenido igual está completo y visible', () => {
    const event = eventWith({ layout: { blocks: [], motion: 'none' } })
    const { container } = renderPage(event)
    expect(container.querySelector('main').dataset.motion).toBe('none')
    expect(container.querySelector('[data-reveal]')).toBeNull()
  })

  it('sin paleta no inyecta colores: rige el tema', () => {
    const { container } = renderPage(eventWith({ themeId: 'ember' }))
    const main = container.querySelector('main')
    expect(main.getAttribute('data-event-theme')).toBe('ember')
    expect(main.getAttribute('style') ?? '').toBe('')
  })

  it('los bloques propios: texto, imagen y botón', () => {
    const event = eventWith({
      layout: {
        blocks: [
          { id: 'hero', type: 'hero' },
          { id: 'text-1', type: 'text', props: { eyebrow: 'Reglas', title: 'Cómo se compite', body: 'Tres intentos.' } },
          { id: 'image-1', type: 'image', props: { path: 'e/x.webp', url: 'https://cdn.test/x.webp', alt: 'Tarima', caption: 'La tarima' } },
          { id: 'cta-1', type: 'cta', props: { title: 'Reglamento', label: 'Leer reglamento', href: 'https://plu.com/reglamento.pdf' } },
          { id: 'cta-2', type: 'cta', props: { label: 'Sin link' } },
        ],
      },
    })
    const { container } = renderPage(event)

    expect(screen.getByRole('heading', { name: 'Cómo se compite' })).toBeTruthy()
    expect(screen.getByText('Tres intentos.')).toBeTruthy()
    expect(screen.getByAltText('Tarima').getAttribute('src')).toBe('https://cdn.test/x.webp')
    const link = screen.getByRole('link', { name: 'Leer reglamento' })
    expect(link.getAttribute('href')).toBe('https://plu.com/reglamento.pdf')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    // Un botón sin link no se dibuja.
    expect(screen.queryByText('Sin link')).toBeNull()
    expect(order(container)).toContain('cta-1')
    expect(order(container)).not.toContain('cta-2')
  })

  it('una imagen sin URL resuelta no deja un bloque roto', () => {
    const event = eventWith({
      layout: { blocks: [{ id: 'hero', type: 'hero' }, { id: 'image-1', type: 'image', props: { path: 'e/x.webp' } }] },
    })
    const { container } = renderPage(event)
    expect(order(container)).toEqual(['hero'])
  })

  describe('acciones de la portada', () => {
    beforeEach(() => {
      actions.isEventRegistrationOpen.mockReset().mockReturnValue(false)
      actions.canBuyEventTickets.mockReset().mockReturnValue(false)
    })

    it('inscripción abierta: ofrece el botón con el texto del staff y abre el flujo', () => {
      actions.isEventRegistrationOpen.mockReturnValue(true)
      const onSelectEvent = vi.fn()
      const event = eventWith({ slots: { ctaLabel: 'Quiero competir' } })
      renderPage(event, { onSelectEvent })

      fireEvent.click(screen.getByRole('button', { name: 'Quiero competir' }))
      expect(onSelectEvent).toHaveBeenCalledWith(event)
    })

    it('sin inscripción pero con entradas: ofrece comprar entradas', () => {
      actions.canBuyEventTickets.mockReturnValue(true)
      const onNavigate = vi.fn()
      renderPage(eventWith({}), { onNavigate })

      fireEvent.click(screen.getAllByRole('button', { name: /comprar entradas/i })[0])
      expect(onNavigate).toHaveBeenCalledWith('tickets', { eventSlug: BASE.slug })
    })

    it('cerrado todo: la portada no ofrece ninguna acción', () => {
      renderPage(eventWith({}))
      expect(screen.queryByRole('button', { name: /inscribirme|comprar entradas/i })).toBeNull()
    })

    it('respeta que las inscripciones estén apagadas en la plataforma', () => {
      renderPage(eventWith({}), { checkoutAvailability: { registrationEnabled: false } })
      expect(actions.isEventRegistrationOpen).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ registrationEnabled: false }),
      )
    })
  })
})
