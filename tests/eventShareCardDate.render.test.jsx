import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventShareCard from '../src/components/ui/EventShareCard.jsx'

/**
 * La fecha de la card compartible.
 *
 * `EventShareCard` imprimía `eventDate` tal cual llegaba, y dos de sus tres
 * llamadores le pasan el valor crudo de la base: `event.date` ("2026-12-12",
 * inscripción a meet) y `starts_at` con hora ("2026-12-12T20:00:00Z", entradas
 * de espectador). El resultado era un ISO impreso en la pieza que el atleta
 * sube a redes. No se notaba porque la card sólo existía detrás de un botón:
 * quedó a la vista al poner la card en la confirmación de inscripción.
 *
 * La normalización vive en el componente para que ninguna superficie nueva
 * pueda volver a filtrar un ISO, y respeta el string ya escrito para humanos
 * —un rango de dos días no se puede derivar de una sola fecha—.
 */

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

vi.mock('../src/services/eventCardService.js', () => ({
  inlineImageAsDataUrl: vi.fn(async () => null),
}))

vi.mock('../src/lib/credentialQr.js', () => ({
  buildAthleteCredentialUrl: vi.fn(() => 'https://plu-arg.com/credencial/PLU-ARG-2026-014'),
  buildCredentialUrl: vi.fn(() => 'https://plu-arg.com/credencial/PLU-ARG-2026-014'),
  generateCredentialQr: vi.fn(async () => null),
}))

const base = {
  athleteName: 'Ana Torres',
  athleteCode: 'PLU-ARG-2026-014',
  eventTitle: 'Pitbull Classic 2026',
  eventVenue: 'Maximal Strength Club',
  eventLocation: 'Buenos Aires',
  variant: 'event',
}

function renderCard(props) {
  render(
    <I18nProvider>
      <EventShareCard {...base} {...props} />
    </I18nProvider>,
  )
  return document.querySelector('.share-card__event-meta')
}

describe('fecha de la card compartible', () => {
  it('escribe la fecha de un día suelto en vez del ISO', () => {
    const meta = renderCard({ eventDate: '2026-12-12' })

    expect(meta.textContent).toContain('12 de dic de 2026')
    expect(meta.textContent).not.toContain('2026-12-12')
  })

  it('escribe también un timestamp completo (entradas de espectador)', () => {
    const meta = renderCard({ eventDate: '2026-12-12T20:00:00Z' })

    expect(meta.textContent).toContain('12 de dic de 2026')
    expect(meta.textContent).not.toContain('T20:00:00')
  })

  it('no toca una fecha ya escrita para humanos', () => {
    // El rango de dos días no se puede derivar de una sola fecha: si el
    // llamador ya lo escribió, se imprime tal cual.
    const meta = renderCard({ eventDate: '12-13 Dic 2026' })

    expect(meta.textContent).toContain('12-13 Dic 2026')
  })

  it('sigue omitiendo el renglón sin fecha', () => {
    expect(renderCard({ eventDate: null })).toBeNull()
  })
})
