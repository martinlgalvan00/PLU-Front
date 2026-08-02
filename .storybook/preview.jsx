import React, { useEffect } from 'react'
import { ThemeProvider, useTheme } from '../src/providers/ThemeProvider.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import { OAuthProvider } from '../src/providers/OAuthProvider.jsx'
import '../src/styles/index.css'

// El runner browser de Storybook/Vitest no aplica siempre el runtime JSX
// automatico de Vite a los componentes importados. Exponer React mantiene
// el preview alineado con el build productivo sin tocar cada componente.
globalThis.React = React

// Goes through the real setTheme() API (not a direct DOM attribute write) so
// the DOM and ThemeProvider's own React context state never disagree —
// components reading theme via useTheme() (e.g. ThemeToggle) must see the
// same value the page is visually rendering.
function ThemeSync({ theme, children }) {
  const { theme: current, setTheme } = useTheme()
  useEffect(() => {
    if (current !== theme) setTheme(theme)
  }, [theme, current, setTheme])
  return children
}

function LocaleSync({ locale, children }) {
  const { locale: current, setLocale } = useI18n()
  useEffect(() => {
    if (current !== locale) setLocale(locale)
  }, [locale, current, setLocale])
  return children
}

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: 'todo',
    },

    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'var(--color-bg, #0b0b0d)' },
      ],
    },
  },

  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Locale',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'es', title: 'Español' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    theme: 'dark',
    locale: 'es',
  },

  decorators: [
    (Story, context) => {
      const { theme, locale } = context.globals
      return (
        <ThemeProvider>
          <ThemeSync theme={theme}>
            <I18nProvider>
              <LocaleSync locale={locale}>
                <OAuthProvider>
                  <div className="app-shell" style={{ padding: '2rem' }}>
                    <Story />
                  </div>
                </OAuthProvider>
              </LocaleSync>
            </I18nProvider>
          </ThemeSync>
        </ThemeProvider>
      )
    },
  ],
}

export default preview
