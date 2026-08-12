import { Component } from 'react'
import PageErrorState from '../ui/PageErrorState.jsx'

/**
 * Aísla el fallo de render de una vista.
 *
 * Sin esto, cualquier excepción de una página (p. ej. una referencia rota
 * durante un HMR) desmonta el árbol entero y deja pantalla en blanco, sin
 * navbar ni forma de salir. Acá el error queda contenido en el área de
 * contenido: el shell sigue operativo y la vista ofrece reintentar o volver.
 *
 * `resetKey` es la vista activa: al navegar a otra pantalla el boundary se
 * limpia solo, así el error no se queda pegado después de salir de la ruta.
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
    this.handleRetry = this.handleRetry.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey === state.resetKey) return null
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error, info) {
    console.error(
      `[PLU] Fallo de render en la vista "${this.props.resetKey}"`,
      error,
      info?.componentStack,
    )
  }

  handleRetry() {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <PageErrorState
          error={this.state.error}
          onGoHome={this.props.onGoHome}
          onRetry={this.handleRetry}
        />
      )
    }

    return this.props.children
  }
}
