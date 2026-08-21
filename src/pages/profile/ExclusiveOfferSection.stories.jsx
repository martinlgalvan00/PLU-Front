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
  // La referencia de la transferencia es DNI + nombre: sin el documento el
  // recibo mostraba 'undefined · Martina Rivas'.
  documentId: '38111222',
  phone: '+54 9 11 3000-1188',
  city: 'La Plata',
  province: 'Buenos Aires',
  country: 'Argentina',
  gym: 'Maximal Power',
  birthDate: '1996-04-02',
  sex: 'F',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: '72',
}

const OFFER = {
  code: 'ONLY-PITBULL',
  campaign: {
    name: 'Pitbull Classic · Pase total',
    description: 'Afiliación anual e inscripción en una sola operación privada.',
    visibility: 'secret',
  },
  kind: 'offer',
  appliesTo: 'combo',
  description: '',
  fixedPrice: 120000,
  fixedPriceManual: null,
  redeemed: false,
  startsAt: null,
  expiresAt: null,
  active: true,
  remaining: 57,
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

/** La orden que ocupó el canje, todavía impaga. */
const PENDING_OFFER = {
  ...OFFER,
  redeemed: true,
  purchase: {
    orderId: '4f6b1c2e-0000-4000-8000-000000000001',
    status: 'pendiente',
    amount: 120000,
    currency: 'ARS',
    concept: 'combo',
    method: 'mercado_pago',
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
    // Misma cadena de ancestros que AthleteProfilePage, con la columna del
    // sidebar incluida: sin ella `.account-main` toma el ancho completo y la
    // ficha se audita a ~1370px en vez de a los ~780px reales.
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-dashboard">
          <aside className="account-sidebar" />
          <div className="account-main">
            <div className="account-sections">
              <div className="account-tab-panel">
                <Story />
              </div>
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

/** Estado terminal aislado: AthleteProfilePage ya no selecciona esta ficha. */
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

/** Perfil sin completar: el CTA pide los datos antes de cobrar. */
export const PerfilIncompleto = {
  args: { athlete: { id: 'ath-story-2', fullName: 'Sin datos' } },
}

/**
 * Compra iniciada y sin pagar. Antes esto decía "ya compraste" y no dejaba
 * terminar: el estado real de la orden es lo que habilita retomar el cobro.
 */
export const PagoEnCurso = {
  args: {
    offer: PENDING_OFFER,
    offers: [PENDING_OFFER],
  },
}

/**
 * La misma compra, pero por transferencia: eso no se cobra con el Brick, se
 * resuelve con el recibo y el comprobante, en la misma ficha.
 */
export const PagoManualEnCurso = {
  args: {
    offer: {
      ...PENDING_OFFER,
      manualChannels: ['bank_transfer'],
      purchase: {
        ...PENDING_OFFER.purchase,
        method: 'manual_link',
        manualPaymentChannel: 'bank_transfer',
        status: 'validacion_manual',
      },
    },
    offers: [PENDING_OFFER],
  },
}

/**
 * Los tres medios que puede habilitar un código. El selector aparece sólo
 * cuando hay algo que elegir, y el precio se recotiza por canal.
 */
export const TresMedios = {
  args: {
    offer: {
      ...OFFER,
      mercadoPagoEnabled: true,
      manualChannels: ['bank_transfer', 'cash_pitbull'],
      fixedPriceManual: 110000,
      event: { ...OFFER.event, registrationManualPrice: 60000 },
      membershipPlan: { ...OFFER.membershipPlan, manualPrice: 80000 },
    },
  },
}

/**
 * El caso que no se podía cargar: una oferta pactada a un precio que sólo
 * cierra cobrada en efectivo. Sin selector —hay un solo medio— y sin Mercado
 * Pago en ninguna parte.
 */
export const SoloEfectivo = {
  args: {
    offer: {
      ...OFFER,
      mercadoPagoEnabled: false,
      manualChannels: ['cash_pitbull'],
      fixedPriceManual: 110000,
    },
  },
}

/** La reserva en efectivo, ya creada: la conclusión es la referencia. */
export const EfectivoReservado = {
  args: {
    offer: {
      ...PENDING_OFFER,
      mercadoPagoEnabled: false,
      manualChannels: ['cash_pitbull'],
      purchase: {
        ...PENDING_OFFER.purchase,
        method: 'manual_link',
        manualPaymentChannel: 'cash_pitbull',
        reference: 'PLU-4F6B1C2E',
        status: 'pendiente',
      },
    },
    offers: [PENDING_OFFER],
  },
}

/** Cobro cerrado desde Administración: la oferta se explica, no se ofrece. */
export const CobroCerrado = {
  args: { checkoutAvailability: { registrationEnabled: false } },
}
