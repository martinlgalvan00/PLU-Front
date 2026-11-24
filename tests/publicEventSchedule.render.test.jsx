import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PublicEventSchedule from '../src/components/ui/PublicEventSchedule.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { normalizePublicSchedule } from '../src/lib/publicSchedule.js'

/**
 * Render de la grilla publicada. Lo que importa: una tabla por tablado con el
 * nombre que puso la organización, las tandas en orden de hora, la composición
 * de cada una y que no aparezca nada que identifique a un atleta.
 */

afterEach(cleanup)

const PAYLOAD = {
  enabled: true,
  platforms: [
    { id: 'p1', name: 'Tablado Rojo', sortOrder: 0 },
    { id: 'p2', name: 'Tablado Azul', sortOrder: 1 },
  ],
  days: [
    {
      dayIndex: 0,
      label: 'Día 1',
      date: '2026-11-13',
      sessions: [
        {
          name: 'Tanda C',
          platformId: 'p1',
          athleteCount: 9,
          sexes: ['Femenino'],
          categories: ['Raw'],
          divisions: ['Open'],
        },
        {
          name: 'Tanda A',
          platformId: 'p1',
          weighInAt: '2026-11-13T11:30:00.000Z',
          startsAt: '2026-11-13T13:00:00.000Z',
          athleteCount: 12,
          sexes: ['Femenino'],
          categories: ['Raw'],
          divisions: ['Junior'],
          weightMin: 52,
          weightMax: 63,
          ageMin: 19,
          ageMax: 23,
        },
        {
          name: 'Tanda B',
          platformId: 'p2',
          weighInAt: '2026-11-13T11:30:00.000Z',
          startsAt: '2026-11-13T13:00:00.000Z',
          athleteCount: 1,
          sexes: ['Masculino'],
          categories: ['Raw'],
          divisions: ['Open'],
          weightMin: 83,
          weightMax: 83,
          ageMin: 27,
          ageMax: 27,
        },
      ],
    },
    {
      dayIndex: 1,
      label: 'Día 2',
      date: '2026-11-14',
      sessions: [{ name: 'Tanda D', platformId: 'p1', athleteCount: 7 }],
    },
  ],
}

function renderSchedule(payload = PAYLOAD) {
  return render(
    <I18nProvider>
      <PublicEventSchedule schedule={normalizePublicSchedule(payload)} />
    </I18nProvider>,
  )
}

describe('PublicEventSchedule', () => {
  it('abre un día a la vez, el primero, y las pestañas cambian de día', () => {
    renderSchedule()

    expect(screen.getByRole('tabpanel', { name: /Día 1/ })).toBeTruthy()
    expect(screen.queryByText('Tanda D')).toBeNull()

    const days = screen.getByRole('tablist', { name: 'Día de competencia' })
    fireEvent.click(within(days).getByRole('tab', { name: /Día 2/ }))

    expect(screen.getByRole('tabpanel', { name: /Día 2/ })).toBeTruthy()
    expect(screen.getByText('Tanda D')).toBeTruthy()
    expect(screen.queryByText('Tanda A')).toBeNull()
  })

  it('las flechas del teclado mueven la selección entre días', () => {
    renderSchedule()
    const days = screen.getByRole('tablist', { name: 'Día de competencia' })
    const first = within(days).getByRole('tab', { name: /Día 1/ })

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(within(days).getByRole('tab', { name: /Día 2/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    // Solo la pestaña activa entra en el orden de tabulación.
    expect(first.getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(days, { key: 'Home' })
    expect(first.getAttribute('aria-selected')).toBe('true')
  })

  it('dice cuándo se confirmó la grilla por última vez, si se sabe', () => {
    const schedule = normalizePublicSchedule(PAYLOAD)
    render(
      <I18nProvider>
        <PublicEventSchedule schedule={schedule} updatedAt={Date.UTC(2026, 10, 13, 15, 32)} />
      </I18nProvider>,
    )
    expect(screen.getByText(/Actualizada \d{2}:\d{2}/)).toBeTruthy()
    cleanup()
    render(
      <I18nProvider>
        <PublicEventSchedule schedule={schedule} />
      </I18nProvider>,
    )
    expect(screen.queryByText(/Actualizada/)).toBeNull()
  })

  it('un solo día no ofrece pestañas', () => {
    renderSchedule({ ...PAYLOAD, days: [PAYLOAD.days[0]] })
    expect(screen.queryByRole('tablist', { name: 'Día de competencia' })).toBeNull()
    expect(screen.getByRole('region', { name: /Día 1/ })).toBeTruthy()
  })

  it('resume el día con tandas y tablados', () => {
    renderSchedule()
    const day = screen.getByRole('tabpanel', { name: /Día 1/ })
    expect(within(day).getByText('3 tandas · 2 tablados')).toBeTruthy()
  })

  it('cada tablado es una tabla con su nombre y su resumen', () => {
    renderSchedule()

    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    const blue = screen.getByRole('group', { name: 'Tablado Azul' })
    expect(within(red).getByText('Tanda A')).toBeTruthy()
    expect(within(red).queryByText('Tanda B')).toBeNull()
    expect(within(blue).getByText('Tanda B')).toBeTruthy()

    const redTable = within(red).getByRole('table')
    expect(
      within(redTable)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Hora', 'Tanda', 'Atletas'])
    // El resumen del tablado: 2 tandas y 21 atletas.
    expect(screen.getByText('2 tandas · 21 atletas')).toBeTruthy()
    expect(screen.getByText('1 tanda · 1 atleta')).toBeTruthy()
  })

  it('las tandas van en orden de hora y la que no tiene hora, al final', () => {
    renderSchedule()
    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    const names = within(red)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByText(/^Tanda /).textContent)
    expect(names).toEqual(['Tanda A', 'Tanda C'])
    expect(within(red).getByText('Horario a confirmar')).toBeTruthy()
  })

  it('cada fila lleva la hora como encabezado de fila y el pesaje al lado', () => {
    renderSchedule()
    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    const row = within(red)
      .getAllByRole('row')
      .find((entry) => entry.textContent.includes('Tanda A'))
    expect(within(row).getAllByRole('rowheader')).toHaveLength(1)
    expect(within(row).getByText(/Pesaje/)).toBeTruthy()
    // La tanda sin horarios no inventa una línea de pesaje.
    const unscheduled = within(red)
      .getAllByRole('row')
      .find((entry) => entry.textContent.includes('Tanda C'))
    expect(within(unscheduled).queryByText(/Pesaje/)).toBeNull()
  })

  it('dice a quién corresponde cada tanda y cuántos son', () => {
    renderSchedule()

    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    expect(within(red).getByText('Femenino · Raw · Junior')).toBeTruthy()
    // El rango va en piezas que no se parten, separadas por un punto medio.
    expect(within(red).getByText('52–63 kg')).toBeTruthy()
    expect(within(red).getByText('19–23 años')).toBeTruthy()

    const rowA = within(red)
      .getAllByRole('row')
      .find((entry) => entry.textContent.includes('Tanda A'))
    expect(within(rowA).getByText('12')).toBeTruthy()

    const blue = screen.getByRole('group', { name: 'Tablado Azul' })
    expect(within(blue).getByText('Masculino · Raw · Open')).toBeTruthy()
  })

  it('una tanda de un solo atleta no publica su peso ni su edad exactos', () => {
    const { container } = renderSchedule()
    expect(container.textContent).not.toMatch(/83 kg|27 años/)
  })

  it('el filtro por tablado oculta el otro solo en ancho angosto', () => {
    const { container } = renderSchedule()

    const focus = screen.getByRole('tablist', { name: 'Ver por tablado' })
    fireEvent.click(within(focus).getByRole('tab', { name: 'Tablado Azul' }))

    const hidden = [...container.querySelectorAll('.public-schedule__panel[data-hidden-narrow]')]
    // La CSS lo oculta únicamente cuando el contenedor es angosto.
    expect(hidden).toHaveLength(1)
    expect(hidden[0].textContent).toContain('Tanda A')

    fireEvent.click(within(focus).getByRole('tab', { name: 'Todos' }))
    expect(container.querySelectorAll('[data-hidden-narrow]')).toHaveLength(0)
  })

  it('titula cada día con su fecha', () => {
    renderSchedule()
    const day = screen.getByRole('tabpanel', { name: /Día 1/ })
    expect(within(day).getByRole('heading', { name: /Día 1/, level: 3 })).toBeTruthy()
    expect(day.querySelector('time[datetime="2026-11-13"]')).not.toBeNull()
  })

  it('no hay nada que identifique a un atleta en el DOM', () => {
    const { container } = renderSchedule({
      ...PAYLOAD,
      // Aunque el backend filtrara un dato de más, el render solo conoce los
      // campos de composición.
      days: [
        {
          ...PAYLOAD.days[0],
          sessions: PAYLOAD.days[0].sessions.map((row) => ({
            ...row,
            fullName: 'Nombre Secreto',
            gym: 'Club Secreto',
            birthDate: '2006-11-20',
          })),
        },
      ],
    })
    expect(container.textContent).not.toMatch(/Secreto|2006/)
  })

  it('apagada o sin tandas no renderiza nada', () => {
    const off = renderSchedule({ enabled: false })
    expect(off.container.innerHTML).toBe('')
    cleanup()
    const empty = renderSchedule({ enabled: true, platforms: [], days: [] })
    expect(empty.container.innerHTML).toBe('')
  })

  it('sin tablados definidos hay una sola tabla, sin título ni filtro', () => {
    const { container } = renderSchedule({
      enabled: true,
      platforms: [],
      days: [{ dayIndex: 0, label: 'Día 1', sessions: [{ name: 'Tanda A', athleteCount: 3 }] }],
    })
    expect(screen.getByText('Tanda A')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(container.querySelector('.public-schedule__panel-head')).toBeNull()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('1 tanda')).toBeTruthy()
  })
})
