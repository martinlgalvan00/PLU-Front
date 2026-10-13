import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PublicEventSchedule from '../src/components/ui/PublicEventSchedule.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { normalizePublicSchedule } from '../src/lib/publicSchedule.js'

/**
 * Render de la grilla publicada. Lo que importa: una columna por tablado con el
 * nombre que puso la organización, la composición de cada tanda y que no
 * aparezca nada que identifique a un atleta.
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
          athleteCount: 1,
          sexes: ['Masculino'],
          categories: ['Raw'],
          divisions: ['Open'],
          weightMin: 83,
          weightMax: 83,
        },
      ],
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
  it('muestra una columna por tablado con el nombre editado por la organización', () => {
    renderSchedule()

    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    const blue = screen.getByRole('group', { name: 'Tablado Azul' })
    expect(within(red).getByText('Tanda A')).toBeTruthy()
    expect(within(red).queryByText('Tanda B')).toBeNull()
    expect(within(blue).getByText('Tanda B')).toBeTruthy()
  })

  it('dice a quién corresponde cada tanda y cuántos son', () => {
    renderSchedule()

    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    expect(within(red).getByText('Femenino · Raw · Junior · 52–63 kg · 19–23 años')).toBeTruthy()
    expect(within(red).getByText('12 atletas')).toBeTruthy()

    const blue = screen.getByRole('group', { name: 'Tablado Azul' })
    // Un solo atleta y un solo peso: ni plural ni rango.
    expect(within(blue).getByText('1 atleta')).toBeTruthy()
    expect(within(blue).getByText('Masculino · Raw · Open · 83 kg')).toBeTruthy()
  })

  it('muestra el horario de pesaje y de inicio cuando existen', () => {
    renderSchedule()
    const red = screen.getByRole('group', { name: 'Tablado Rojo' })
    expect(within(red).getByText(/Pesaje/)).toBeTruthy()
    expect(within(red).getByText(/Inicio/)).toBeTruthy()
    // La tanda sin horarios no inventa una línea vacía.
    const blue = screen.getByRole('group', { name: 'Tablado Azul' })
    expect(within(blue).queryByText(/Pesaje/)).toBeNull()
  })

  it('titula cada día con su fecha', () => {
    renderSchedule()
    const day = screen.getByRole('region', { name: /Día 1/ })
    expect(within(day).getByRole('heading', { name: /Día 1/ })).toBeTruthy()
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

  it('sin tablados definidos las tandas van en una sola columna sin cabecera', () => {
    renderSchedule({
      enabled: true,
      platforms: [],
      days: [{ dayIndex: 0, label: 'Día 1', sessions: [{ name: 'Tanda A', athleteCount: 3 }] }],
    })
    expect(screen.getByText('Tanda A')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 4 })).toBeNull()
  })
})
