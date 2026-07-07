import { createContext, useContext } from 'react'

export const disabledOAuth = {
  configured: false,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: async () => {},
  logout: async () => {},
  getAccessToken: async () => null,
}

export const OAuthContext = createContext(disabledOAuth)

export function usePluOAuth() {
  return useContext(OAuthContext)
}
