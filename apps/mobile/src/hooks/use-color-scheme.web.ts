import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Web-only variant.
 *
 * Static rendering has no color scheme, so the server-rendered pass must return
 * a fixed value and the real one can only be read after hydration. That
 * hydration flag genuinely requires an effect — the mismatch it prevents is a
 * React hydration error, not a preference.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marking hydration is the one thing only an effect can observe
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
