// src/theme/darkTheme.js
import { theme } from 'antd'
import { sharedThemeTokens } from './tokens'

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedThemeTokens,
    // Superficies base en dark mode
    colorPrimary: '#fafafa',
    colorInfo: '#fafafa',
    colorBgBase: '#0a0a0a',
    colorBgContainer: '#111111',
    colorBgElevated: '#161616',
    colorBgLayout: '#0a0a0a',

    // Texto
    colorTextBase: '#ffffff', // --plu-ink-inverse
    colorTextSecondary: '#cfcfcf',
    colorTextQuaternary: '#8f8f8f',

    // Bordes
    colorBorder: 'rgba(255, 255, 255, 0.14)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
  },
}
