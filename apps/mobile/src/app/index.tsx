/**
 * Entry redirect. The website is apps/web (Next.js), not a route here.
 */

import { Redirect } from 'expo-router';

import { useSurfaceState } from '@/platform/use-surface-state';

export default function Index() {
  const { entry } = useSurfaceState();
  return <Redirect href={entry} />;
}
