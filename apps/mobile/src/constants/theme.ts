/**
 * App theme is the shared token set, mapped onto names the screens already use.
 * Do not add a hex here — change packages/tokens.
 */

import { color, radius, space, type ColorPalette } from '@world/tokens';

import '@/global.css';

import { Platform } from 'react-native';

function scheme(palette: ColorPalette) {
  return {
    text: palette.text,
    background: palette.bg,
    backgroundElement: palette.bgElevated,
    backgroundSelected: palette.bgSelected,
    textSecondary: palette.textMuted,
    accent: palette.accent,
    danger: palette.danger,
    warning: palette.warning,
    success: palette.success,
    line: palette.line,
  };
}

export const Colors = {
  light: scheme(color.light),
  dark: scheme(color.dark),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = space;
export const Radius = radius;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
