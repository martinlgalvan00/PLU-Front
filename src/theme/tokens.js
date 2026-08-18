// src/theme/tokens.js

// Brand tokens mapeados desde src/styles/tokens/palette.css y src/styles/variables.css
// Estos son los valores base que usará ConfigProvider para definir los colores primarios.

export const brandTokens = {
  // Familia tipográfica principal
  fontFamily: '"Poppins", ui-sans-serif, system-ui, sans-serif',

  // Azul institucional
  brandBlue: '#1f5f9e', // --plu-celeste-600
  brandBlueLight: '#74acdf', // --plu-celeste-400
  brandBlueDim: 'rgba(116, 172, 223, 0.18)', // --plu-celeste-alpha-18

  // Amarillo / Dorado (CTA Primario)
  brandGold: '#f2b705', // --plu-gold-500
  brandGoldDark: '#a9790f', // --plu-gold-600
  brandGoldLight: '#ffd23f', // --plu-gold-400

  // Estado: Error / Danger
  danger: '#e10600', // --plu-red-500
  dangerHover: '#ff3b36', // --plu-red-400

  // Estado: Success
  success: '#3d9a62', // --plu-success-500
  successHover: '#2d7a4a', // --plu-success-600

  // Estado: Warning
  warning: '#b45309', // --plu-warning-500

  // Bordes y layouts
  borderRadiusBase: 10, // --border-radius-md
  borderRadiusSm: 6, // --border-radius-sm
  borderRadiusLg: 14, // --border-radius-lg

  // Motion
  motionDurationFast: '160ms',
  motionDurationBase: '240ms',
  motionDurationSlow: '480ms',
}

// Configuración base de Ant Design (theme.token) que comparten tanto el light como el dark theme
export const sharedThemeTokens = {
  fontFamily: brandTokens.fontFamily,
  fontFamilyCode: '"JetBrains Mono", ui-monospace, monospace',

  colorPrimary: brandTokens.brandGold, // Por defecto la acción primaria es gold
  colorInfo: brandTokens.brandBlue,
  colorSuccess: brandTokens.success,
  colorWarning: brandTokens.warning,
  colorError: brandTokens.danger,

  borderRadius: brandTokens.borderRadiusBase,
  borderRadiusSM: brandTokens.borderRadiusSm,
  borderRadiusLG: brandTokens.borderRadiusLg,

  wireframe: false,
}
