import PublicEventSchedule from './PublicEventSchedule.jsx'
import { normalizePublicSchedule } from '../../lib/publicSchedule.js'

/**
 * Grilla publicada. Los datos son los que devuelve `public_event_schedule`:
 * composición por tanda, nunca nombres.
 */

const DOUBLE = {
  enabled: true,
  platforms: [
    { id: 'p1', name: 'Tablado 1', sortOrder: 0 },
    { id: 'p2', name: 'Tablado 2', sortOrder: 1 },
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
          weightMin: 47,
          weightMax: 57,
          ageMin: 18,
          ageMax: 23,
        },
        {
          name: 'Tanda B',
          platformId: 'p2',
          weighInAt: '2026-11-13T11:30:00.000Z',
          startsAt: '2026-11-13T13:00:00.000Z',
          athleteCount: 11,
          sexes: ['Masculino'],
          categories: ['Raw'],
          divisions: ['Junior', 'Open'],
          weightMin: 66,
          weightMax: 83,
          ageMin: 19,
          ageMax: 31,
        },
        {
          name: 'Tanda C',
          platformId: 'p1',
          weighInAt: '2026-11-13T14:00:00.000Z',
          startsAt: '2026-11-13T15:30:00.000Z',
          athleteCount: 9,
          sexes: ['Femenino'],
          categories: ['Raw With Wraps'],
          divisions: ['Open'],
          weightMin: 57,
          weightMax: 72,
          ageMin: 24,
          ageMax: 38,
        },
      ],
    },
    {
      dayIndex: 1,
      label: 'Día 2',
      date: '2026-11-14',
      sessions: [
        {
          name: 'Tanda E',
          platformId: 'p2',
          weighInAt: '2026-11-14T14:00:00.000Z',
          startsAt: '2026-11-14T15:30:00.000Z',
          athleteCount: 1,
          sexes: ['Femenino'],
          categories: ['Raw'],
          divisions: ['Master 1'],
          weightMin: 63,
          weightMax: 63,
          ageMin: 41,
          ageMax: 41,
        },
        {
          name: 'Tanda D',
          platformId: 'p1',
          weighInAt: '2026-11-14T11:30:00.000Z',
          startsAt: '2026-11-14T13:00:00.000Z',
          athleteCount: 12,
          sexes: ['Masculino'],
          categories: ['Raw'],
          divisions: ['Open'],
          weightMin: 93,
          weightMax: 120,
          ageMin: 22,
          ageMax: 41,
        },
      ],
    },
  ],
}

const meta = { title: 'UI/PublicEventSchedule', component: PublicEventSchedule }
export default meta

/**
 * Doble tablado, dos días: línea de tiempo con una columna por tablado y el
 * nombre que eligió la organización. La Tanda E es de un solo atleta: su rango
 * de peso y edad no se publica.
 */
export const DobleTablado = { args: { schedule: normalizePublicSchedule(DOUBLE) } }

/** Tablados con nombre propio y una tanda sin hora de inicio (va al final, "a confirmar"). */
export const NombresPropiosYSinHora = {
  args: {
    schedule: normalizePublicSchedule({
      ...DOUBLE,
      platforms: [
        { id: 'p1', name: 'Tablado Rojo — Femenino', sortOrder: 0 },
        { id: 'p2', name: 'Tablado Azul — Masculino', sortOrder: 1 },
      ],
      days: [
        {
          ...DOUBLE.days[0],
          sessions: [
            ...DOUBLE.days[0].sessions,
            { name: 'Tanda F', platformId: 'p2', athleteCount: 6, sexes: ['Masculino'] },
          ],
        },
      ],
    }),
  },
}

/**
 * Una jornada completa: más tandas de las que entran en pantalla. Cada tabla
 * scrollea por dentro con el encabezado fijo y la página no se alarga.
 */
const FULL_DAY = {
  ...DOUBLE,
  days: [
    {
      dayIndex: 0,
      label: 'Día 1',
      date: '2026-11-13',
      sessions: Array.from({ length: 24 }, (_, index) => {
        const half = index % 2 === 0
        const slot = Math.floor(index / 2)
        const start = new Date(
          Date.UTC(2026, 10, 13, 12 + Math.floor(slot * 0.75), (slot * 45) % 60),
        )
        const weighIn = new Date(start.getTime() - 90 * 60 * 1000)
        return {
          name: `Tanda ${String.fromCharCode(65 + (index % 26))}${index >= 26 ? 2 : ''}`,
          platformId: half ? 'p1' : 'p2',
          weighInAt: weighIn.toISOString(),
          startsAt: start.toISOString(),
          athleteCount: 8 + ((index * 3) % 5),
          sexes: [half ? 'Femenino' : 'Masculino'],
          categories: [index % 3 === 0 ? 'Raw With Wraps' : 'Raw'],
          divisions: [['Junior', 'Open', 'Master 1'][index % 3]],
          weightMin: 47 + slot * 4,
          weightMax: 52 + slot * 4,
          ageMin: 18 + (index % 3) * 8,
          ageMax: 23 + (index % 3) * 8,
        }
      }),
    },
  ],
}

export const JornadaCompleta = { args: { schedule: normalizePublicSchedule(FULL_DAY) } }

/** Un solo tablado: una columna, sin partir el día. */
export const UnTablado = {
  args: {
    schedule: normalizePublicSchedule({
      ...DOUBLE,
      platforms: [DOUBLE.platforms[0]],
      days: [
        {
          ...DOUBLE.days[0],
          sessions: DOUBLE.days[0].sessions.map((row) => ({ ...row, platformId: 'p1' })),
        },
      ],
    }),
  },
}

/** Apagada: no renderiza nada (el sitio ni siquiera dibuja el encabezado de la sección). */
export const Apagada = { args: { schedule: normalizePublicSchedule({ enabled: false }) } }
