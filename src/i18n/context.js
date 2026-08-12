import { createContext } from 'react'

/** Contexto aislado: no debe re-ejecutarse con HMR de locales/provider. */
export const I18nContext = createContext(null)
