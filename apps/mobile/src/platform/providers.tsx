/**
 * Composition root.
 *
 * Startup order matters and is enforced here:
 *
 *   1. Validate the configuration and fail loudly on an impossible combination,
 *      before anything renders. A game that appears to save and does not is far
 *      more expensive to diagnose than a crash on launch.
 *   2. Load the device id, so records can be stamped with their writer.
 *   3. Restore identity, which establishes the owner every storage call needs.
 *   4. Start replication, but only in a mode that actually defers writes.
 *
 * Children render only after step 3, so no screen has to handle "no player yet".
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Body, Centered, Heading } from '@/components/ui';
import { appConfig } from '@/config/app.config';
import { assertValidConfig } from '@/config/app.config.schema';
import { Spacing } from '@/constants/theme';
import { primeDeviceId } from '@/core/device/device-id';
import { createLogger, redactedMessage } from '@/core/logging';
import { getSyncEngine } from '@/core/storage';
import { useTheme } from '@/hooks/use-theme';
import { useIdentity } from './use-identity';

const log = createLogger('bootstrap');

type BootState = { phase: 'starting' } | { phase: 'ready' } | { phase: 'failed'; message: string };

export function AppProviders({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootState>({ phase: 'starting' });
  const restore = useIdentity((state) => state.restore);
  const identityStatus = useIdentity((state) => state.status);
  const identityError = useIdentity((state) => state.error);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        assertValidConfig();
        await primeDeviceId();
        await restore();

        if (cancelled) return;

        // Only the hybrid mode has an engine; the others replicate immediately
        // or not at all.
        const engine = getSyncEngine();
        if (engine) {
          engine.start();
          log.info('Replication started', { intervalMs: appConfig.persistence.syncIntervalMs });
        }

        setBoot({ phase: 'ready' });
      } catch (error) {
        log.error('Startup failed', error);
        if (!cancelled) setBoot({ phase: 'failed', message: redactedMessage(error) });
      }
    }

    void start();

    return () => {
      cancelled = true;
      getSyncEngine()?.stop();
    };
  }, [restore]);

  if (boot.phase === 'failed') {
    return <StartupError message={boot.message} />;
  }

  if (identityStatus === 'error' && identityError) {
    return <StartupError message={identityError} />;
  }

  if (boot.phase === 'starting') {
    return <Loading />;
  }

  return <>{children}</>;
}

function Loading() {
  return (
    <Centered>
      <ActivityIndicator size="large" />
    </Centered>
  );
}

/**
 * A deliberately unstyled, information-dense failure screen. Startup failures
 * here are almost always configuration mistakes, and the fastest fix comes from
 * showing the developer the whole message rather than a friendly summary.
 */
function StartupError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Centered>
      <View style={styles.errorBlock}>
        <Heading>Cannot start</Heading>
        <Text style={[styles.errorMessage, { color: theme.text }]}>{message}</Text>
        <Body muted>
          This is a configuration problem, not a crash. Check packages/config/src/app.config.ts and the
          quickstart in specs/001-game-platform-foundation/quickstart.md.
        </Body>
      </View>
    </Centered>
  );
}

const styles = StyleSheet.create({
  errorBlock: { gap: Spacing.three, maxWidth: 520 },
  errorMessage: { fontSize: 14, lineHeight: 20, fontFamily: 'monospace' },
});
