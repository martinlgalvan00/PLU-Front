import ResultsSortMenu from './ResultsSortMenu.jsx'

const options = [
  ['recent', 'Más recientes', 'Recientes'],
  ['oldest', 'Más antiguos', 'Antiguos'],
  ['name', 'A → Z', 'A → Z'],
]

export default {
  title: 'UI/ResultsSortMenu',
  component: ResultsSortMenu,
  tags: ['autodocs'],
  args: {
    sort: 'recent',
    options,
    onSortChange: () => {},
  },
}

export const Default = {}

export const Luxury = {
  args: { luxury: true },
}
