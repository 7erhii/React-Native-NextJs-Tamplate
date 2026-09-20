import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import type { IconName } from '@world/tokens';
import { useTheme } from '@/hooks/use-theme';

const ios: Record<IconName, SFSymbol> = {
  home: 'house',
  person: 'person',
  settings: 'gearshape',
  install: 'square.and.arrow.down',
  check: 'checkmark.circle',
  warning: 'exclamationmark.triangle',
  add: 'plus',
  'sign-in': 'person.badge.key',
};

const android: Record<IconName, AndroidSymbol> = {
  home: 'home',
  person: 'person',
  settings: 'settings',
  install: 'download',
  check: 'check_circle',
  warning: 'warning',
  add: 'add',
  'sign-in': 'login',
};

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();

  return (
    <SymbolView
      name={{ ios: ios[name], android: android[name], web: android[name] }}
      size={size}
      tintColor={color ?? theme.text}
    />
  );
}
