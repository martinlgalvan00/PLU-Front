import CredentialQr from './CredentialQr.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'

/**
 * La placa del QR de la credencial, con el tratamiento de marca PLU (puntos
 * redondeados, esquinas extra-rounded, isotipo al centro) y el reveal de una
 * sola pasada al terminar de generarse.
 *
 * `Pending` muestra el estado intermedio real: el QR se genera con import
 * dinámico, así que ese hueco existe en todos los dispositivos.
 */
export default {
  title: 'UI/CredentialQr',
  component: CredentialQr,
  tags: ['autodocs'],
  loaders: [
    async () => ({
      qrSrc: await generateCredentialQr(buildCredentialUrl({ code: 'PREV-STORYBOOK' })).catch(
        () => null,
      ),
    }),
  ],
  render: (args, { loaded }) => <CredentialQr {...args} src={args.src ?? loaded.qrSrc} />,
  args: {
    alt: 'Código QR de tu credencial',
    size: 'md',
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, display: 'grid', justifyItems: 'start' }}>
        <Story />
      </div>
    ),
  ],
}

/** Código generado, tamaño de la credencial. */
export const Ready = {}

/** Tamaño grande (modal de credencial / pantalla de puerta). */
export const Large = { args: { size: 'lg' } }

/** Tamaño chico (entradas, listados). */
export const Small = { args: { size: 'sm' } }

/** Generando: la trama del código ocupa el hueco del import dinámico. */
export const Pending = {
  loaders: [async () => ({ qrSrc: null })],
  args: { src: null },
}

/** El QR no se pudo generar: placa con ícono, sin pulso de carga. */
export const Failed = {
  loaders: [async () => ({ qrSrc: null })],
  args: { src: null, failed: true },
}
