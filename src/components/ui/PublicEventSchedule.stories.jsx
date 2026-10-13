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
          name: 'Tanda D',
          platformId: 'p1',
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

/** Doble tablado, dos días: una columna por tablado con el nombre que eligió la organización. */
export const DobleTablado = { args: { schedule: normalizePublicSchedule(DOUBLE) } }

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
