// src/theme/lightTheme.js
import { theme } from 'antd'
import { sharedThemeTokens } from './tokens'

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedThemeTokens,
    // Superficies base en light mode
    colorPrimary: '#0a0a0a',
    colorInfo: '#0a0a0a',
    colorBgBase: '#fafafa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#fafafa',

    // Texto
    colorTextBase: '#0a0a0a',
    colorTextSecondary: '#3d3d3d',
    colorTextQuaternary: '#6b6b6b',

    // Bordes
    colorBorder: 'rgba(15, 17, 23, 0.10)',
    colorBorderSecondary: 'rgba(15, 17, 23, 0.06)',
  },
}
