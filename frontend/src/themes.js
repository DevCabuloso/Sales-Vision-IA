export const THEMES = {
  night: {
    label: 'Night', dark: true,
    preview: ['#1d232a', '#38bdf8', '#818cf8'],
    colors: { primary: '#6366F1', secondary: '#818CF8', accent: '#38BDF8', success: '#10B981', info: '#0EA5E9', warning: '#F59E0B', error: '#EF4444', background: '#0f1623', surface: '#1A2130' },
    css: { '--app-bg': '#0f1623', '--glow-1': 'rgba(56,189,248,0.10)', '--glow-2': 'rgba(129,140,248,0.07)', '--glass-bg': 'rgba(29,35,42,0.80)', '--glass-border': '#2d3748', '--scrollbar': '#2d3748' },
  },
  dracula: {
    label: 'Dracula', dark: true,
    preview: ['#282a36', '#bd93f9', '#ff79c6'],
    colors: { primary: '#BD93F9', secondary: '#FF79C6', accent: '#8BE9FD', success: '#50FA7B', info: '#8BE9FD', warning: '#FFB86C', error: '#FF5555', background: '#1e1f2e', surface: '#282A36' },
    css: { '--app-bg': '#1e1f2e', '--glow-1': 'rgba(189,147,249,0.10)', '--glow-2': 'rgba(255,121,198,0.07)', '--glass-bg': 'rgba(40,42,54,0.80)', '--glass-border': '#44475a', '--scrollbar': '#44475a' },
  },
  synthwave: {
    label: 'Synthwave', dark: true,
    preview: ['#2d1b69', '#e779c1', '#58c7f3'],
    colors: { primary: '#E779C1', secondary: '#58C7F3', accent: '#F3CC30', success: '#67CBA0', info: '#58C7F3', warning: '#EEA4CE', error: '#FF5555', background: '#1a1035', surface: '#2D1B69' },
    css: { '--app-bg': '#1a1035', '--glow-1': 'rgba(231,121,193,0.12)', '--glow-2': 'rgba(88,199,243,0.08)', '--glass-bg': 'rgba(45,27,105,0.75)', '--glass-border': '#4a2a8a', '--scrollbar': '#4a2a8a' },
  },
  cyberpunk: {
    label: 'Cyberpunk', dark: false,
    preview: ['#ffee00', '#ff7598', '#75d1f0'],
    colors: { primary: '#FF7598', secondary: '#75D1F0', accent: '#FFEE00', success: '#35BDB2', info: '#75D1F0', warning: '#FF7598', error: '#FF3F3F', background: '#fffce0', surface: '#FFFFFF' },
    css: { '--app-bg': '#fffce0', '--glow-1': 'rgba(255,117,152,0.15)', '--glow-2': 'rgba(117,209,240,0.10)', '--glass-bg': 'rgba(255,252,224,0.85)', '--glass-border': '#e0d800', '--scrollbar': '#cc9b00' },
  },
  coffee: {
    label: 'Coffee', dark: true,
    preview: ['#20180e', '#db924b', '#c9a96e'],
    colors: { primary: '#DB924B', secondary: '#C9A96E', accent: '#E8CCA5', success: '#67CBA0', info: '#8BE9FD', warning: '#DB924B', error: '#FF5555', background: '#160d05', surface: '#20180E' },
    css: { '--app-bg': '#160d05', '--glow-1': 'rgba(219,146,75,0.10)', '--glow-2': 'rgba(201,169,110,0.07)', '--glass-bg': 'rgba(32,24,14,0.80)', '--glass-border': '#3d2c1a', '--scrollbar': '#3d2c1a' },
  },
  luxury: {
    label: 'Luxury', dark: true,
    preview: ['#09090b', '#dca54c', '#6b7280'],
    colors: { primary: '#DCA54C', secondary: '#6B7280', accent: '#F0E6C8', success: '#10B981', info: '#6B7280', warning: '#DCA54C', error: '#EF4444', background: '#050506', surface: '#09090B' },
    css: { '--app-bg': '#050506', '--glow-1': 'rgba(220,165,76,0.10)', '--glow-2': 'rgba(107,114,128,0.07)', '--glass-bg': 'rgba(9,9,11,0.85)', '--glass-border': '#27272a', '--scrollbar': '#27272a' },
  },
  halloween: {
    label: 'Halloween', dark: true,
    preview: ['#212121', '#f28c18', '#6d3a63'],
    colors: { primary: '#F28C18', secondary: '#6D3A63', accent: '#E8821A', success: '#67CBA0', info: '#9CA3AF', warning: '#F28C18', error: '#FF5555', background: '#181818', surface: '#212121' },
    css: { '--app-bg': '#181818', '--glow-1': 'rgba(242,140,24,0.12)', '--glow-2': 'rgba(109,58,99,0.08)', '--glass-bg': 'rgba(33,33,33,0.80)', '--glass-border': '#3d2c12', '--scrollbar': '#3d2c12' },
  },
  dark: {
    label: 'Dark', dark: true,
    preview: ['#1d2430', '#661ae6', '#d926aa'],
    colors: { primary: '#661AE6', secondary: '#D926AA', accent: '#1FB2A6', success: '#36D399', info: '#3ABFF8', warning: '#FBBD23', error: '#F87272', background: '#161c27', surface: '#1D2430' },
    css: { '--app-bg': '#161c27', '--glow-1': 'rgba(102,26,230,0.10)', '--glow-2': 'rgba(217,38,170,0.07)', '--glass-bg': 'rgba(29,36,48,0.80)', '--glass-border': '#2d3a4f', '--scrollbar': '#2d3a4f' },
  },
  corporate: {
    label: 'Corporate', dark: false,
    preview: ['#ffffff', '#4b6bfb', '#3b82f6'],
    colors: { primary: '#4B6BFB', secondary: '#7C3AED', accent: '#3B82F6', success: '#36D399', info: '#3ABFF8', warning: '#FBBD23', error: '#F87272', background: '#f5f7fa', surface: '#FFFFFF' },
    css: { '--app-bg': '#f5f7fa', '--glow-1': 'rgba(75,107,251,0.08)', '--glow-2': 'rgba(59,130,246,0.06)', '--glass-bg': 'rgba(255,255,255,0.85)', '--glass-border': '#e2e8f0', '--scrollbar': '#cbd5e1' },
  },
  emerald: {
    label: 'Emerald', dark: false,
    preview: ['#ffffff', '#66cc8a', '#377cfb'],
    colors: { primary: '#66CC8A', secondary: '#377CFB', accent: '#1FB2A6', success: '#36D399', info: '#3ABFF8', warning: '#FBBD23', error: '#F87272', background: '#f0fdf4', surface: '#FFFFFF' },
    css: { '--app-bg': '#f0fdf4', '--glow-1': 'rgba(102,204,138,0.10)', '--glow-2': 'rgba(55,124,251,0.07)', '--glass-bg': 'rgba(240,253,244,0.85)', '--glass-border': '#bbf7d0', '--scrollbar': '#6ee7b7' },
  },
  cupcake: {
    label: 'Cupcake', dark: false,
    preview: ['#faf7f5', '#ef9fbc', '#65c3c8'],
    colors: { primary: '#65C3C8', secondary: '#EF9FBC', accent: '#EEAF3A', success: '#36D399', info: '#3ABFF8', warning: '#FBBD23', error: '#F87272', background: '#faf7f5', surface: '#FFFFFF' },
    css: { '--app-bg': '#faf7f5', '--glow-1': 'rgba(239,159,188,0.10)', '--glow-2': 'rgba(101,195,200,0.07)', '--glass-bg': 'rgba(250,247,245,0.85)', '--glass-border': '#e9ddd7', '--scrollbar': '#d8c4bb' },
  },
  winter: {
    label: 'Winter', dark: false,
    preview: ['#ffffff', '#047aed', '#463aa1'],
    colors: { primary: '#047AED', secondary: '#463AA1', accent: '#C148AC', success: '#23893D', info: '#357EE6', warning: '#DA8B1F', error: '#D03232', background: '#f5f9ff', surface: '#FFFFFF' },
    css: { '--app-bg': '#f5f9ff', '--glow-1': 'rgba(4,122,237,0.08)', '--glow-2': 'rgba(70,58,161,0.06)', '--glass-bg': 'rgba(245,249,255,0.85)', '--glass-border': '#cfe2ff', '--scrollbar': '#9bc3ff' },
  },
  agency: {
    label: 'Agency', dark: true,
    preview: ['#080C18', '#00C2FF', '#3B82F6'],
    colors: { primary: '#00C2FF', secondary: '#3B82F6', accent: '#00E5FF', success: '#10B981', info: '#00C2FF', warning: '#F59E0B', error: '#EF4444', background: '#080C18', surface: '#111827' },
    css: { '--app-bg': '#080C18', '--glow-1': 'rgba(0,194,255,0.13)', '--glow-2': 'rgba(59,130,246,0.09)', '--glass-bg': 'rgba(17,24,39,0.85)', '--glass-border': 'rgba(0,194,255,0.12)', '--scrollbar': '#1e3a5f' },
  },
}

export const THEME_GROUPS = {
  Escuro: ['night', 'dracula', 'synthwave', 'dark', 'agency', 'cyberpunk', 'coffee', 'luxury', 'halloween'],
  Claro: ['corporate', 'emerald', 'cupcake', 'winter'],
}

const DARK_EXTRA  = { '--text-primary':'#F1F5F9','--text-secondary':'#9FB0BC','--text-muted':'#6B7C88','--text-faint':'#3A4A55','--border-subtle':'rgba(255,255,255,0.06)','--border-medium':'rgba(255,255,255,0.1)','--panel-bg':'rgba(255,255,255,0.03)','--panel-hover':'rgba(255,255,255,0.04)','--item-hover':'rgba(255,255,255,0.035)' }
const LIGHT_EXTRA = { '--text-primary':'#0F172A','--text-secondary':'#475569','--text-muted':'#64748B','--text-faint':'#94A3B8','--border-subtle':'rgba(0,0,0,0.07)','--border-medium':'rgba(0,0,0,0.12)','--panel-bg':'rgba(0,0,0,0.03)','--panel-hover':'rgba(0,0,0,0.04)','--item-hover':'rgba(0,0,0,0.03)' }

export function applyTheme(key) {
  const t = THEMES[key]
  if (!t) return
  const root = document.documentElement
  const extra = t.dark ? DARK_EXTRA : LIGHT_EXTRA
  Object.entries({ ...t.css, ...extra }).forEach(([prop, val]) => root.style.setProperty(prop, val))
  root.setAttribute('data-theme-dark', t.dark ? '1' : '0')
}
