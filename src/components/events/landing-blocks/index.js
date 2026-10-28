import CalendarBlock from './CalendarBlock.jsx'
import CountdownBlock from './CountdownBlock.jsx'
import CustomCtaBlock from './CustomCtaBlock.jsx'
import CustomGalleryBlock from './CustomGalleryBlock.jsx'
import CustomImageBlock from './CustomImageBlock.jsx'
import CustomMapBlock from './CustomMapBlock.jsx'
import CustomPaymentsBlock from './CustomPaymentsBlock.jsx'
import CustomSponsorsBlock from './CustomSponsorsBlock.jsx'
import CustomTextBlock from './CustomTextBlock.jsx'
import CustomVideoBlock from './CustomVideoBlock.jsx'
import FactsBlock from './FactsBlock.jsx'
import FaqBlock from './FaqBlock.jsx'
import HeroBlock from './HeroBlock.jsx'
import LivestreamBlock from './LivestreamBlock.jsx'
import LocationBlock from './LocationBlock.jsx'
import MaterialsBlock from './MaterialsBlock.jsx'
import ScheduleBlock from './ScheduleBlock.jsx'
import TextSlotBlock from './TextSlotBlock.jsx'
import TicketsBlock from './TicketsBlock.jsx'
import WeighInsBlock from './WeighInsBlock.jsx'

/** Tipo de bloque → componente. Un tipo nuevo se suma acá y en `eventLandingLayout.js`. */
export const LANDING_BLOCK_COMPONENTS = Object.freeze({
  hero: HeroBlock,
  facts: FactsBlock,
  countdown: CountdownBlock,
  experience: TextSlotBlock,
  categories: TextSlotBlock,
  schedule: ScheduleBlock,
  weighIns: WeighInsBlock,
  location: LocationBlock,
  tickets: TicketsBlock,
  livestream: LivestreamBlock,
  calendar: CalendarBlock,
  faq: FaqBlock,
  materials: MaterialsBlock,
  text: CustomTextBlock,
  image: CustomImageBlock,
  cta: CustomCtaBlock,
  gallery: CustomGalleryBlock,
  sponsors: CustomSponsorsBlock,
  payments: CustomPaymentsBlock,
  video: CustomVideoBlock,
  map: CustomMapBlock,
})
