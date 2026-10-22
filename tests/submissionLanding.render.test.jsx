import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
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

function renderLanding(event = EVENT, props = {}) {
  return render(
    <I18nProvider>
      <SubmissionLandingPage eventSlug={event.slug} events={[event]} {...props} />
    </I18nProvider>,
  )
}

describe('SubmissionLandingPage', () => {
  it('muestra una landing completa aun cuando las inscripciones estan proximas', () => {
    renderLanding()
    expect(screen.getByRole('heading', { name: 'Barbell Submission' })).toBeTruthy()
    expect(screen.getAllByText('EN PREPARACION')).toHaveLength(2)
    expect(screen.getByText('Virtus Fitness')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LA EXPERIENCIA' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'INFORMACION DE COMPETENCIA' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver calendario' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
  })

  it('en publicada habilita el CTA de inscripcion cuando el evento esta abierto', () => {
    const onSelectEvent = vi.fn()
    renderLanding(
      {
        ...EVENT,
        status: 'inscripcion_abierta',
        landing: { templateId: 'submission', phase: 'published', slots: { ctaLabel: 'Competir' } },
      },
      { onSelectEvent },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Competir' }))
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ slug: EVENT.slug }))
  })
})
