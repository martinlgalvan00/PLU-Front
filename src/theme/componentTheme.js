// src/theme/componentTheme.js
import { brandTokens } from './tokens'

export const componentTheme = {
  Button: {
    controlHeight: 40,
    controlHeightSM: 32,
    controlHeightLG: 48,
    borderRadius: brandTokens.borderRadiusBase,
    paddingInline: 24,
    fontWeight: 600,
  },
  Input: {
    controlHeight: 40,
    controlHeightLG: 48,
    borderRadius: brandTokens.borderRadiusBase,
  },
  Select: {
    controlHeight: 40,
    controlHeightLG: 48,
    borderRadius: brandTokens.borderRadiusBase,
  },
  DatePicker: {
    controlHeight: 40,
    controlHeightLG: 48,
    borderRadius: brandTokens.borderRadiusBase,
  },
  Table: {
    headerBg: 'var(--admin-table-head)',
    headerColor: 'inherit',
    rowHoverBg: 'var(--admin-row-hover)',
    borderRadius: brandTokens.borderRadiusBase,
  },
  Card: {
    borderRadiusLG: brandTokens.borderRadiusLg,
  },
  Menu: {
    itemBorderRadius: brandTokens.borderRadiusSm,
    itemBg: 'transparent',
    itemColor: 'var(--admin-text-secondary)',
    itemHoverBg: 'var(--admin-sidebar-hover)',
    itemHoverColor: 'var(--admin-ink)',
    itemSelectedBg: 'var(--admin-row-hover)',
    itemSelectedColor: 'var(--admin-ink)',
    groupTitleColor: 'var(--admin-muted)',
  },
  Layout: {
    siderBg: 'var(--admin-sidebar)',
    headerBg: 'var(--admin-canvas)',
    bodyBg: 'var(--admin-canvas)',
    headerHeight: 62,
    headerPadding: '0 24px',
  },
  Drawer: {
    paddingLG: 24,
  },
  Modal: {
    paddingLG: 24,
    borderRadiusLG: brandTokens.borderRadiusLg,
  },
}
