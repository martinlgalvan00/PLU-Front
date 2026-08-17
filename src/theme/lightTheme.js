// src/theme/lightTheme.js
import { theme } from 'antd';
import { sharedThemeTokens } from './tokens';

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedThemeTokens,
    // Superficies base en light mode
    colorBgBase: '#f7f6f3', // --plu-warm-50
    colorBgContainer: '#ffffff', // --color-bg-surface
    colorBgElevated: '#fcfcfc', // color-mix derivado
    colorBgLayout: '#f7f6f3',

    // Texto
    colorTextBase: '#1a1c22', // --plu-ink-900
    colorTextSecondary: '#2c2f3c', // --color-text-secondary
    colorTextQuaternary: '#636878', // --color-text-muted

    // Bordes
    colorBorder: 'rgba(15, 17, 23, 0.10)',
    colorBorderSecondary: 'rgba(15, 17, 23, 0.06)',
  },
};
