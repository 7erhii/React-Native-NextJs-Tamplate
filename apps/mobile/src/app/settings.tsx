/**
 * Settings and diagnostics.
 *
 * Primarily a developer surface: it shows which adapters the current
 * configuration produced and what replication is doing. That matters because the
 * whole design hinges on being able to switch modes, and a switch you cannot
 * observe is a switch you cannot trust.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  KeyValue,
  Row,
  Screen,
  Subheading,
} from '@/components/ui';
import { appConfig, formatProductRelease } from '@/config/app.config';
import { Spacing } from '@/constants/theme';
import { useIdentity } from '@/platform/use-identity';
import { useSyncStatus } from '@/platform/use-sync-status';

export default function SettingsScreen() {
  const router = useRouter();
  const identity = useIdentity((state) => state.identity);
  const capabilities = useIdentity((state) => state.capabilities);
  const sync = useSyncStatus();

  return (
    <Screen>
      <View style={styles.header}>
        <Row>
          <Icon name="settings" />
          <Heading>Settings</Heading>
        </Row>
        <Body muted>Everything here is decided by packages/config/src/app.config.ts.</Body>
      </View>

      <Card>
        <Subheading>Active configuration</Subheading>
        <KeyValue label="Version" value={formatProductRelease()} />
        <KeyValue label="Persistence mode" value={appConfig.persistence.mode} />
        <KeyValue label="Identity mode" value={appConfig.identity.mode} />
        <KeyValue label="Website" value={appConfig.web.enabled ? 'on (Next.js)' : 'off'} />
        <KeyValue label="Web auth" value={appConfig.web.auth ? 'on' : 'off'} />
        <KeyValue label="Mobile auth" value={appConfig.mobile.auth ? 'on' : 'off'} />
        <KeyValue label="Auth source" value={appConfig.authSource} />
        <KeyValue label="Auth wall" value={appConfig.mobile.authWall} />
        <KeyValue label="Conflict strategy" value={appConfig.persistence.conflictStrategy} />
        <KeyValue label="Transfer codes" value={appConfig.features.transferCodes ? 'on' : 'off'} />
        <Divider />
        <Body muted>
          Change any of these in one file and restart. No game or screen code needs to change.
        </Body>
      </Card>

      <Card>
        <Subheading>Storage adapter</Subheading>
        <KeyValue label="Adapter" value={sync.storeId} />
        <Row gap={Spacing.two}>
          <Badge
            label={sync.offlineCapable ? 'Works offline' : 'Needs network'}
            tone={sync.offlineCapable ? 'positive' : 'warning'}
          />
          <Badge
            label={sync.crossDevice ? 'Cross-device' : 'This device only'}
            tone={sync.crossDevice ? 'positive' : 'warning'}
          />
        </Row>
      </Card>

      <Card>
        <Subheading>Identity adapter</Subheading>
        <KeyValue label="Tier" value={identity?.tier ?? 'unknown'} />
        <KeyValue label="Can sign in" value={capabilities.canSignIn ? 'yes' : 'no'} />
        <KeyValue label="Can upgrade" value={capabilities.canUpgrade ? 'yes' : 'no'} />
        <KeyValue
          label="Providers"
          value={capabilities.providers.length ? capabilities.providers.join(', ') : 'none'}
        />
      </Card>

      {appConfig.features.diagnostics && (
        <Card>
          <Subheading>Design system</Subheading>
          <Body muted>Primitives and tokens, same ones the screens use.</Body>
          <Button label="Open UI kit" variant="secondary" onPress={() => router.push('/ui-kit')} />
        </Card>
      )}

      {appConfig.features.diagnostics && (
        <Card>
          <Subheading>Replication</Subheading>
          {sync.available ? (
            <>
              <KeyValue label="Engine" value={sync.running ? 'running' : 'stopped'} />
              <KeyValue label="Pending writes" value={String(sync.pending)} />
              <KeyValue
                label="Last sync"
                value={sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString() : 'never'}
              />
              {sync.lastReport && (
                <KeyValue
                  label="Last result"
                  value={`↑${sync.lastReport.pushed} ↓${sync.lastReport.pulled} ⚠${sync.lastReport.conflicts}`}
                />
              )}
              {sync.lastError && <Body>{sync.lastError}</Body>}
              <Button label="Sync now" variant="secondary" onPress={() => void sync.flush()} />
            </>
          ) : (
            <Body muted>
              This mode has no deferred replication, so there is nothing to report. Set
              persistence.mode to &ldquo;hybrid&rdquo; to enable queued background sync.
            </Body>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one },
});
