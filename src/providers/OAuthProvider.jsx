import { lazy, Suspense } from 'react'
import { env } from '../config/env.js'
import { disabledOAuth, OAuthContext } from './oauthContext.js'

// Auth0 es un camino de login opcional: el SDK (~60 KB) solo se descarga
// cuando hay credenciales configuradas; si no, ni siquiera entra al grafo.
const OAuthProviderAuth0 = lazy(() => import('./OAuthProviderAuth0.jsx'))

export function OAuthProvider({ children }) {
  if (!env.auth0.configured) {
    return <OAuthContext.Provider value={disabledOAuth}>{children}</OAuthContext.Provider>
  }

  // Mientras carga el chunk, la UI monta con OAuth deshabilitado y se
  // rehidrata solo: evita bloquear el primer render por una dependencia
  // de autenticación alternativa.
  return (
    <Suspense
      fallback={
        <OAuthContext.Provider value={disabledOAuth}>{children}</OAuthContext.Provider>
      }
    >
      <OAuthProviderAuth0>{children}</OAuthProviderAuth0>
    </Suspense>
  )
}
