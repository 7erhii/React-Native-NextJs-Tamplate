/**
 * Product home.
 *
 * This is what sits behind the optional website and the optional auth wall.
 * Today it is the game hub. A todo app replaces this screen — not the website,
 * not the wall, not the identity port.
 */

import { Link, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Card, Heading, Row, Screen, Subheading } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { gameRegistry } from '@/core/games/registry';
import { useTheme } from '@/hooks/use-theme';
import { useIdentity } from '@/platform/use-identity';
import { useSyncStatus } from '@/platform/use-sync-status';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const identity = useIdentity((state) => state.identity);
  const sync = useSyncStatus();

  /**
   * Stated plainly rather than optimistically. A player with device-only storage
   * deserves to know their progress is one lost phone away from gone, and the UI
   * should not imply durability it cannot provide.
   */
  const durability = !identity
    ? { label: 'Starting…', tone: 'neutral' as const }
    : identity.supportsCrossDevice
      ? { label: 'Progress saved to the cloud', tone: 'positive' as const }
      : { label: 'Progress saved on this device only', tone: 'warning' as const };

  return (
    <Screen>
      <View style={styles.header}>
        <Row>
          <Icon name="home" />
          <Heading>Games</Heading>
        </Row>
        <Body muted>
          {gameRegistry.length} {gameRegistry.length === 1 ? 'game' : 'games'} available
        </Body>
      </View>

      <Card onPress={() => router.push('/profile')}>
        <Row style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={styles.avatarLabel}>
              {identity?.displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Subheading>{identity?.displayName ?? 'Loading…'}</Subheading>
            <Badge label={durability.label} tone={durability.tone} />
          </View>
        </Row>
        {sync.pending > 0 && (
          <Body muted>
            {sync.pending} change{sync.pending === 1 ? '' : 's'} waiting to sync
          </Body>
        )}
      </Card>

      <View style={styles.gameList}>
        {gameRegistry.map((game) => (
          <Card key={game.id} onPress={() => router.push(`/play/${game.id}`)}>
            <Row gap={Spacing.three}>
              <Text style={styles.gameIcon}>{game.icon}</Text>
              <View style={styles.gameText}>
                <Subheading>{game.title}</Subheading>
                <Body muted>{game.description}</Body>
              </View>
            </Row>
          </Card>
        ))}
      </View>

      {gameRegistry.length === 0 && (
        <Card>
          <Subheading>No games registered</Subheading>
          <Body muted>
            Add a folder under src/games/ and one entry in src/core/games/registry.ts.
          </Body>
        </Card>
      )}

      <Link href="/settings" style={styles.settingsLink}>
        <Row>
          <Icon name="settings" />
          <Body muted>Settings and diagnostics</Body>
        </Row>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one },
  profileRow: { gap: Spacing.three },
  profileText: { flex: 1, gap: Spacing.one, alignItems: 'flex-start' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { fontSize: 20, fontWeight: '700' },
  gameList: { gap: Spacing.two },
  gameIcon: { fontSize: 34 },
  gameText: { flex: 1, gap: Spacing.one },
  settingsLink: { paddingVertical: Spacing.two },
});
