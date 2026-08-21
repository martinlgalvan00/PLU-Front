// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage) y acá se necesita para auditar el widget en la superficie
// donde más se usa. El componente ya trae su hoja y la del sello.
import { expect, userEvent, waitFor, within } from 'storybook/test'
import '../../styles/pages/account.css'
import SecretOfferCodeRedeemer from './SecretOfferCodeRedeemer.jsx'

/**
 * Canje universal de código dentro de Mi cuenta > Beneficios.
 *
 * Lleva el registro de la credencial (`code-band.css`): sello con filo de oro,
 * el código en el mono espaciado del número de socio, chip metálico como única
 * acción plena, y el estado dicho en palabras en la ficha superior en vez de
 * pintado con color.
 */

const ATHLETE_SESSION = { role: 'athlete_plu', email: 'martina@plu.test' }

export default {
  title: 'Cuenta/SecretOfferCodeRedeemer',
  component: SecretOfferCodeRedeemer,
  parameters: { layout: 'fullscreen' },
  args: {
    session: ATHLETE_SESSION,
    className: 'account-code-redeemer',
    onNavigate: () => {},
    onOfferUnlocked: () => {},
  },
  decorators: [
    // Misma cadena de ancestros que AthleteProfilePage, con la columna del
    // sidebar incluida: sin ella `.account-main` no toma su ancho real y la
    // banda se audita a un tercio del que tiene en la ficha.
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-dashboard">
          <aside className="account-sidebar" />
          <div className="account-main">
            <div className="account-sections" style={{ paddingBottom: 24 }}>
              <div className="account-section">
                <Story />
              </div>
            </div>
          </div>
        </div>
      </main>
    ),
  ],
}

/** Cerrado: una línea con el sello. No usa celeste — esto no es navegación. */
export const Cerrado = {}

/** Abierto: la banda con el código vacío y el chip todavía deshabilitado. */
export const Abierto = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /tengo un código/i }))
    await waitFor(() => expect(canvas.getByLabelText(/^código$/i)).toBeInTheDocument())
    // Sin código escrito la acción no está disponible: misma regla que tenía el
    // formulario anterior.
    await expect(canvas.getByRole('button', { name: /^canjear$/i })).toBeDisabled()
  },
}

/** Con un código escrito: el chip se habilita y el código toma la tinta de oro. */
export const ConCodigo = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /tengo un código/i }))
    // En minúscula a propósito: el campo fuerza mayúsculas al tipear.
    await userEvent.type(await canvas.findByLabelText(/^código$/i), 'only-pitbull')
    await waitFor(() => expect(canvas.getByRole('button', { name: /^canjear$/i })).toBeEnabled())
  },
}

/** Sin sesión de atleta el canje pide ingresar; el código queda guardado. */
export const SinSesion = {
  args: { session: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /tengo un código/i }))
    await userEvent.type(await canvas.findByLabelText(/^código$/i), 'only-pitbull')
    await userEvent.click(canvas.getByRole('button', { name: /^canjear$/i }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /ingresar/i })).toBeInTheDocument(),
    )
  },
}
