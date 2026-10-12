import HomeAthleteJourney from './HomeAthleteJourney.jsx'

export default {
  title: 'UI/HomeAthleteJourney',
  component: HomeAthleteJourney,
  tags: ['autodocs'],
  args: {
    onNavigate: () => {},
  },
}

/** Tres capítulos con riel de progreso; en desktop, la credencial QR queda fija al costado. */
export const Default = {}

/** Sin `onNavigate` los capítulos son solo lectura (sin links). */
export const ReadOnly = {
  args: { onNavigate: undefined },
}
