import { useMemo } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { env } from '../config/env.js'
import { OAuthContext } from './oauthContext.js'

function Auth0Bridge({ children }) {
  const { error, getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, logout } =
    useAuth0()

  const value = useMemo(
    () => ({
      configured: true,
      error,
      isAuthenticated,
      isLoading,
      login: () =>
        loginWithRedirect({
          appState: { returnTo: 'admin' },
          authorizationParams: {
            prompt: 'login',
          },
        }),
      logout: () =>
        logout({
          logoutParams: {
            returnTo: env.appUrl,
          },
        }),
      getAccessToken: () =>
        getAccessTokenSilently({
          authorizationParams: {
            audience: env.auth0.audience,
          },
        }),
    }),
    [error, getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, logout],
  )

  return <OAuthContext.Provider value={value}>{children}</OAuthContext.Provider>
}

export default function OAuthProviderAuth0({ children }) {
  return (
    <Auth0Provider
      domain={env.auth0.domain}
      clientId={env.auth0.clientId}
      authorizationParams={{
        redirect_uri: env.auth0.redirectUri,
        audience: env.auth0.audience,
      }}
      cacheLocation="memory"
      useRefreshTokens={false}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  )
}
