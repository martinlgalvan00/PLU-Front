import ConfirmationSeal from './ConfirmationSeal.jsx'

/**
 * El acuse de los tres momentos que cierran un trámite en PLU: afiliación
 * acreditada, inscripción confirmada y pago aprobado. Es el mismo gesto en
 * los tres a propósito — cambia el dato, no la ceremonia.
 *
 * La secuencia (anillo trazado → check dibujado → texto) corre una sola vez
 * al montar. Para volver a verla, recargá la story.
 */
export default {
  title: 'UI/ConfirmationSeal',
  component: ConfirmationSeal,
  tags: ['autodocs'],
  args: {
    // En Storybook nunca vibra: la story se monta sola, sin que nadie haya
    // completado un pago.
    haptic: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 520, padding: 20 }}>
        <Story />
      </div>
    ),
  ],
}

/** Afiliación acreditada: el número de socio va como sello. */
export const Membership = {
  args: {
    variant: 'membership',
    eyebrow: 'Afiliación acreditada',
    seal: 'PLU-ARG-2026-001',
    title: 'Ya sos parte de PLU Argentina',
    detail: 'Vigente hasta 31 ene 2027',
  },
}

/** Inscripción a un meet confirmada. */
export const Registration = {
  args: {
    variant: 'registration',
    eyebrow: 'Inscripción confirmada',
    title: 'Tu lugar está confirmado',
    detail: 'Llevate tu card con el evento, tu categoría y tu QR de ingreso.',
  },
}

/** Pago acreditado en el checkout: el monto es el sello. */
export const Payment = {
  args: {
    variant: 'payment',
    eyebrow: 'Pago acreditado',
    seal: '$ 48.000',
    title: 'Listo, quedó pago',
    detail: 'Pago aprobado. La acreditación ya fue registrada.',
  },
}

/**
 * Con la ráfaga de papel laminado (`celebrate`): el sello se estampa y a los
 * ~560 ms sale el confeti PLU desde el anillo. La capa se monta por portal en
 * `body`, es fija del tamaño del viewport y se desmonta sola al terminar — no
 * deja nada girando ni puede generar scroll horizontal.
 *
 * Bajo `prefers-reduced-motion` no se monta un solo nodo de la ráfaga: queda
 * el sello completo, sin trazo. Recargá la story para volver a verla.
 */
export const MembershipCelebrada = {
  args: {
    variant: 'membership',
    celebrate: true,
    eyebrow: 'Afiliación acreditada',
    seal: 'PLU-ARG-2026-001',
    title: 'Ya sos parte de PLU Argentina',
    detail: 'Vigente hasta 31 ene 2027',
  },
}

/** Sin bajada ni sello: el mínimo que sigue leyéndose como confirmación. */
export const TitleOnly = {
  args: {
    variant: 'registration',
    title: 'Tu lugar está confirmado',
  },
}
