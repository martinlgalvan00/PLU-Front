import FAQAccordion from './FAQAccordion.jsx'

const items = [
  {
    q: '¿Cómo me afilio?',
    a: 'Podés afiliarte desde la sección Miembros completando el formulario.',
  },
  {
    q: '¿Cuándo son las próximas fechas?',
    a: 'Consultá el calendario oficial en la sección Eventos.',
  },
  { q: '¿Qué reglamento se utiliza?', a: 'Usamos el reglamento oficial de Powerlifting United.' },
]

export default {
  title: 'UI/FAQAccordion',
  component: FAQAccordion,
  tags: ['autodocs'],
  args: { items },
}

export const Default = {}

export const Numbered = {
  args: { numbered: true, variant: 'ref' },
}
