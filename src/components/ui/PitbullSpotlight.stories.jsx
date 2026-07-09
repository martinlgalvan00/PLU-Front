import PitbullSpotlight from './PitbullSpotlight.jsx'

export default {
  title: 'UI/PitbullSpotlight',
  component: PitbullSpotlight,
  tags: ['autodocs'],
  args: {
    onDetail: () => {},
    onRegister: () => {},
  },
}

export const Card = {
  args: { variant: 'card' },
}

export const Home = {
  args: { variant: 'home' },
}

export const Events = {
  args: { variant: 'events' },
}
