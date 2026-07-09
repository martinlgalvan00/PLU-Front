import ResultCard from './ResultCard.jsx'

export default {
  title: 'UI/ResultCard',
  component: ResultCard,
  tags: ['autodocs'],
  args: {
    athlete: 'Juan Pérez',
    event: 'Apertura Nacional 2026',
    total: '540kg',
    place: '1° -83kg',
    date: '08 Ago 2026',
  },
}

export const Gold = {}

export const Silver = {
  args: { place: '2° -83kg' },
}

export const NoMedal = {
  args: { place: '7° -83kg' },
}

export const Featured = {
  args: { featured: true },
}
