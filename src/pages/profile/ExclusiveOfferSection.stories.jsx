// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage, no el entry global) y la hoja de la oferta también:
// sin los dos imports la ficha se ve sin tarjeta y sin desglose.
import '../../styles/pages/account.css'
import '../../styles/components/exclusive-offer.css'
import ExclusiveOfferSection from './ExclusiveOfferSection.jsx'

/**
 * Ficha "Oferta exclusiva": lo que ve quien canjeó un código secreto.
 *
 * No es un cupón. Un cupón resta plata sobre un precio que ya estaba a la
 * vista; esto es un paquete distinto —afiliación + inscripción a un precio
 * propio— que sólo existe para quien tiene el código. Por eso el código es el
 * título de la ficha y el desglose muestra contra qué se compara.
 */

const EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  date: '12 DIC',
  venue: 'Club Atlético',
  location: 'CABA',
}

const ATHLETE = {
  id: 'ath-story-1',
  fullName: 'Martina Rivas',
  phone: '+54 9 11 3000-1188',
  city: 'La Plata',
  province: 'Buenos Aires',
  country: 'Argentina',
  gym: 'Maximal Power',
  birthDate: '1996-04-02',
  sex: 'F',
}

const OFFER = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  appliesTo: 'combo',
  description: '',
  fixedPrice: 120000,
  fixedPriceManual: null,
  redeemed: false,
  startsAt: null,
  expiresAt: null,
  active: true,
  event: {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    registrationPrice: 65000,
    registrationManualPrice: null,
    currency: 'ARS',
  },
  comboOffer: {
    price: 150000,
    manualPrice: null,
    currency: 'ARS',
    active: true,
    audience: 'code',
    startsAt: null,
    endsAt: null,
  },
  membershipPlan: {
    code: 'plu-annual',
    name: 'Afiliación anual',
    price: 85000,
    manualPrice: null,
    currency: 'ARS',
  },
}

export default {
  title: 'Cuenta/ExclusiveOfferSection',
  component: ExclusiveOfferSection,
  parameters: { layout: 'fullscreen' },
  args: {
    offer: OFFER,
    offers: [OFFER],
    athlete: ATHLETE,
    events: [EVENT],
    onNavigate: () => {},
    onSelectEvent: () => {},
    onNavigateSection: () => {},
  },
  decorators: [
    // Misma cadena de ancestros que AthleteProfilePage.
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-main">
          <div className="account-sections">
            <div className="account-tab-panel">
              <Story />
            </div>
          </div>
        </div>
      </main>
    ),
  ],
}

/** El caso real: ONLY-PITBULL, afiliación + inscripción a $120.000. */
export const Desbloqueada = {}

/** Con fecha de cierre: la urgencia se dice, no se decora. */
export const ConCierre = {
  args: { offer: { ...OFFER, expiresAt: '2026-11-30T23:59:00Z' } },
}

/** Copy propio cargado desde Administración: gana sobre el texto por defecto. */
export const ConDescripcion = {
  args: {
    offer: {
      ...OFFER,
      description: 'Reservada para el equipo Pitbull. Cupo cerrado de 40 lugares.',
    },
  },
}

/** Ya comprada: la ficha pasa a ser el registro de lo que canjeó. */
export const YaCanjeada = {
  args: { offer: { ...OFFER, redeemed: true }, offers: [{ ...OFFER, redeemed: true }] },
}

/** El combo del evento se apagó: no se ofrece un checkout que va a fallar. */
export const ComboNoDisponible = {
  args: { offer: { ...OFFER, comboOffer: { ...OFFER.comboOffer, active: false } } },
}

/**
 * Precio pactado más bajo por transferencia. El desglose sigue comparando
 * contra la suma de las partes del mismo canal.
 */
export const ConPrecioManual = {
  args: {
    offer: {
      ...OFFER,
      fixedPriceManual: 110000,
      event: { ...OFFER.event, registrationManualPrice: 60000 },
      membershipPlan: { ...OFFER.membershipPlan, manualPrice: 80000 },
    },
  },
}

/** Perfil sin completar: el CTA pide los datos antes de mandar al checkout. */
export const PerfilIncompleto = {
  args: { athlete: { id: 'ath-story-2', fullName: 'Sin datos' } },
}
