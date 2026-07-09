import ResultsArchiveToolbar from './ResultsArchiveToolbar.jsx'

const filters = [
  ['all', 'Todos', 'Todos'],
  ['published', 'Publicados', 'Pub.'],
  ['pending', 'En espera', 'Espera'],
]

const sorts = [
  ['recent', 'Más recientes', 'Recientes'],
  ['oldest', 'Más antiguos', 'Antiguos'],
  ['name', 'A → Z', 'A → Z'],
]

export default {
  title: 'UI/ResultsArchiveToolbar',
  component: ResultsArchiveToolbar,
  tags: ['autodocs'],
  args: {
    count: 12,
    filter: 'all',
    filters,
    sort: 'recent',
    sorts,
    query: '',
    onFilterChange: () => {},
    onQueryChange: () => {},
    onSortChange: () => {},
  },
}

export const Default = {}

export const Hero = {
  args: { hero: true, segmented: true, filterIndex: 0, filterCount: filters.length },
}

export const Compact = {
  args: { compact: true },
}
