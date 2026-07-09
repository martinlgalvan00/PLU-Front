import SectionHeading from './SectionHeading.jsx'

export default {
  title: 'UI/SectionHeading',
  component: SectionHeading,
  tags: ['autodocs'],
  args: {
    eyebrow: 'Comunidad',
    title: 'Nuestra historia',
    description: 'Powerlifting United reúne a atletas de todo el país.',
  },
}

export const Centered = {}

export const Left = {
  args: { align: 'left' },
}

export const RefVariant = {
  args: { variant: 'ref', align: 'left' },
}
