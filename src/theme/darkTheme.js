// src/theme/darkTheme.js
import { theme } from 'antd';
import { sharedThemeTokens } from './tokens';

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedThemeTokens,
    // Superficies base en dark mode
    colorBgBase: '#0a0b0d', // --plu-cool-950
    colorBgContainer: '#181a1f', // --plu-cool-800
    colorBgElevated: '#1e2026', // --plu-cool-750
    colorBgLayout: '#0a0b0d',

    // Texto
    colorTextBase: '#ffffff', // --plu-ink-inverse
    colorTextSecondary: '#d4d4dc', // --color-text-secondary
    colorTextQuaternary: '#9a9aa8', // --color-text-muted

    // Bordes
    colorBorder: 'rgba(255, 255, 255, 0.14)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
  },
};
