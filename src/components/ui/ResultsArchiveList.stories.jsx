import ResultsArchiveList from './ResultsArchiveList.jsx'

const entries = [
  {
    slug: 'spring-classic-2025',
    title: 'Spring Classic 2025',
    venue: 'Club Atlético River',
    location: 'CABA',
    dateISO: '2025-10-04',
    resultsStatus: 'published',
    featured: false,
  },
  {
    slug: 'apertura-nacional-2026',
    title: 'Apertura Nacional 2026',
    venue: 'Estadio Malvinas',
    location: 'Mendoza',
    dateISO: '2026-08-08',
    resultsStatus: 'pending',
    featured: true,
  },
]

export default {
  title: 'UI/ResultsArchiveList',
  component: ResultsArchiveList,
  tags: ['autodocs'],
  args: {
    entries,
    onNavigate: () => {},
    onSelect: () => {},
  },
}

export const Default = {}

export const Expanded = {
  args: { selectedSlug: 'spring-classic-2025' },
}

export const Empty = {
  args: { entries: [] },
}
