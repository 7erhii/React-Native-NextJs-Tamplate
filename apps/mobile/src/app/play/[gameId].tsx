/**
 * Generic game host.
 *
 * Resolves a game from the registry and renders it. It knows nothing about any
 * particular game, which is what allows a game to be added or removed without
 * touching platform routing.
 */

import { Stack, useLocalSearchParams } from 'expo-router';

import { Body, Card, Screen, Subheading } from '@/components/ui';
import { findGame } from '@/core/games/registry';

export default function PlayScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const game = findGame(gameId);

  if (!game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Card>
          <Subheading>No such game</Subheading>
          <Body muted>
            &ldquo;{gameId}&rdquo; is not in the registry. Check src/core/games/registry.ts.
          </Body>
        </Card>
      </Screen>
    );
  }

  const GameComponent = game.component;

  return (
    <Screen>
      <Stack.Screen options={{ title: game.title }} />
      <GameComponent />
    </Screen>
  );
}
