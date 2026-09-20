/**
 * Shared visual language. Not React.
 *
 * Web maps these to CSS variables. Mobile maps them to the theme object.
 * Screens never invent a hex.
 */

export const color = {
  light: {
    bg: '#ffffff',
    bgElevated: '#F0F0F3',
    bgSelected: '#E0E1E6',
    text: '#111113',
    textMuted: '#60646C',
    textFaint: '#8B8F96',
    accent: '#208AEF',
    accentSoft: '#3B9EFF',
    danger: '#D93036',
    warning: '#C47700',
    success: '#1F8A4C',
    line: '#E0E1E6',
    bannerBg: '#1c1917',
    bannerText: '#fbbf24',
  },
  dark: {
    bg: '#0b0d10',
    bgElevated: '#14171c',
    bgSelected: '#2E3135',
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
    textFaint: '#71717a',
    accent: '#208AEF',
    accentSoft: '#60a5fa',
    danger: '#D93036',
    warning: '#C47700',
    success: '#1F8A4C',
    line: '#27272a',
    bannerBg: '#1c1917',
    bannerText: '#fbbf24',
  },
} as const;

export type ColorPalette = { [K in keyof typeof color.light]: string };
export type ColorName = keyof ColorPalette;
export type ColorScheme = keyof typeof color;

export const space = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export type SpaceName = keyof typeof space;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  kicker: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 1.6, textTransform: 'uppercase' as const },
  caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  subheading: { fontSize: 19, fontWeight: '600' as const, lineHeight: 24 },
  heading: { fontSize: 30, fontWeight: '700' as const, lineHeight: 36, letterSpacing: -0.5 },
  display: { fontSize: 48, fontWeight: '700' as const, lineHeight: 52, letterSpacing: -1.2 },
} as const;

export type TypeName = keyof typeof type;
