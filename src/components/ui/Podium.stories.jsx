import Podium from './Podium.jsx'

const results = [
  { place: '1° -83kg', athlete: 'Juan Pérez', event: 'Apertura Nacional', total: '540kg' },
  { place: '2° -83kg', athlete: 'Carlos Ruiz', event: 'Apertura Nacional', total: '510kg' },
  { place: '3° -83kg', athlete: 'Lucas Díaz', event: 'Apertura Nacional', total: '495kg' },
]

export default {
  title: 'UI/Podium',
  component: Podium,
  tags: ['autodocs'],
  args: { results },
}

export const Default = {}
