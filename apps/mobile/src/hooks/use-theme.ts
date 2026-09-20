import { Colors } from '@/constants/theme';
import { useColorScheme } from './use-color-scheme';

/**
 * Widened from the const-asserted palette so that light and dark are the same
 * type. Without this, each scheme's literal hex values form a distinct type and
 * the two branches are not assignable to one another.
 */
export type Theme = { -readonly [K in keyof typeof Colors.light]: string };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
