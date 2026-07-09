import ResultsEventPanel from './ResultsEventPanel.jsx'

const entry = {
  slug: 'spring-classic-2025',
  title: 'Spring Classic 2025',
  venue: 'Club Atlético River',
  location: 'CABA',
}

export default {
  title: 'UI/ResultsEventPanel',
  component: ResultsEventPanel,
  tags: ['autodocs'],
  args: {
    entry,
    onClose: () => {},
  },
}

export const Default = {}
