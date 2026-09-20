/**
 * Profile: identity, optional sign-in, and cross-device transfer.
 *
 * Every affordance on this screen is conditional on the active adapter's
 * declared capabilities. In device-only mode there is no sign-in button at all,
 * rather than one that fails when pressed — an affordance that cannot work is
 * worse than an absent one.
 */

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  KeyValue,
  Mono,
  Row,
  Screen,
  Subheading,
} from '@/components/ui';
import { appConfig } from '@/config/app.config';
import { Spacing } from '@/constants/theme';
import {
  createTransferCode,
  describeRedeemOutcome,
  formatCode,
  redeemTransferCode,
} from '@/core/transfer/transfer-code.service';
import { redactedMessage } from '@/core/logging';
import { useTheme } from '@/hooks/use-theme';
import { useIdentity } from '@/platform/use-identity';
import { useSaveState } from '@/platform/use-save-state';
import { tapRush } from '@/games/tap-rush/definition';

export default function ProfileScreen() {
  const theme = useTheme();
  const identity = useIdentity((state) => state.identity);
  const capabilities = useIdentity((state) => state.capabilities);
  const busy = useIdentity((state) => state.busy);
  const authError = useIdentity((state) => state.error);
  const conflict = useIdentity((state) => state.conflict);
  const dismissConflict = useIdentity((state) => state.dismissConflict);
  const signIn = useIdentity((state) => state.signIn);
  const signOut = useIdentity((state) => state.signOut);

  // Shown so the effect of an upgrade or transfer on real progress is visible
  // on the same screen where those actions happen.
  const { data: tapRushSave, reload } = useSaveState(tapRush);

  const transferEnabled = appConfig.features.transferCodes && capabilities.canTransfer;

  if (!identity) {
    return (
      <Screen>
        <Body muted>Loading…</Body>
      </Screen>
    );
  }

  const tierLabel = {
    device: 'Device only',
    anonymous: 'Anonymous cloud profile',
    account: 'Signed in',
  }[identity.tier];

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>{identity.displayName}</Heading>
        <Row gap={Spacing.two}>
          <Badge
            label={tierLabel}
            tone={identity.tier === 'account' ? 'positive' : 'neutral'}
          />
          {!identity.supportsCrossDevice && (
            <Badge label="This device only" tone="warning" />
          )}
        </Row>
      </View>

      {conflict && (
        <Card>
          <Subheading>Two sets of progress</Subheading>
          <Body>{conflict.existing.detail}</Body>
          <Body muted>
            Nothing has been changed. Choosing automatically would destroy one history, so this is
            left to you.
          </Body>
          <Button label="Dismiss" variant="secondary" onPress={dismissConflict} />
        </Card>
      )}

      {authError && (
        <Card>
          <Subheading>Sign-in problem</Subheading>
          <Body>{authError}</Body>
        </Card>
      )}

      <Card>
        <Subheading>Progress</Subheading>
        <KeyValue label="Tap Rush best" value={String(tapRushSave.bestScore)} />
        <KeyValue label="Rounds played" value={String(tapRushSave.roundsPlayed)} />
        <Divider />
        <Body muted>
          {identity.supportsCrossDevice
            ? 'Saved in the cloud and available on your other devices.'
            : 'Saved on this device. If you lose the device, this progress is gone.'}
        </Body>
      </Card>

      {capabilities.canSignIn && identity.tier !== 'account' && (
        <Card>
          <Subheading>Secure your progress</Subheading>
          <Body muted>
            Signing in with Google keeps everything above. Your existing progress moves with you —
            it is attached to the same profile rather than replaced.
          </Body>
          <Button
            label="Continue with Google"
            busy={busy}
            onPress={async () => {
              await signIn('google');
              await reload();
            }}
          />
        </Card>
      )}

      {identity.tier === 'account' && (
        <Card>
          <Subheading>Account</Subheading>
          <KeyValue label="Email" value={identity.email ?? 'unknown'} />
          <Body muted>
            Signing out keeps the app playable — you continue with a fresh anonymous profile.
          </Body>
          <Button label="Sign out" variant="secondary" busy={busy} onPress={() => void signOut()} />
        </Card>
      )}

      {transferEnabled && <TransferSection onRedeemed={reload} />}

      {!capabilities.canSignIn && (
        <Card>
          <Subheading>No accounts in this mode</Subheading>
          <Body muted>
            identity.mode is &ldquo;{appConfig.identity.mode}&rdquo;, which has no sign-in. Change it
            in packages/config/src/app.config.ts to offer accounts.
          </Body>
        </Card>
      )}

      <Body muted style={{ color: theme.textSecondary }}>
        Player id {identity.playerId.slice(0, 8)}… · adapter {appConfig.identity.mode}
      </Body>
    </Screen>
  );
}

/**
 * Cross-device transfer for players who have no account.
 *
 * The warnings here are deliberate. A code is a bearer credential for an entire
 * progress history, and the honest cost of not requiring registration is that
 * losing the code means losing the progress. Saying so is better than implying a
 * safety net that does not exist.
 */
function TransferSection({ onRedeemed }: { onRedeemed: () => Promise<void> }) {
  const theme = useTheme();
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function generate() {
    setWorking(true);
    setMessage(null);
    try {
      setIssued(await createTransferCode());
    } catch (error) {
      setMessage(redactedMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function redeem() {
    setWorking(true);
    setMessage(null);
    try {
      const outcome = await redeemTransferCode(entry);
      setMessage(describeRedeemOutcome(outcome));
      if (outcome.status === 'ok') {
        setEntry('');
        await onRedeemed();
      }
    } catch (error) {
      setMessage(redactedMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <Subheading>Move to another device</Subheading>
      <Body muted>
        Generate a code here, then enter it on the other device. Codes work once and expire.
      </Body>

      {issued ? (
        <View style={styles.codeBlock}>
          <Mono>{issued.code}</Mono>
          <Body muted>Expires {new Date(issued.expiresAt).toLocaleString()}</Body>
          <Body muted>
            Write it down now. It is not stored anywhere readable and cannot be shown again.
          </Body>
        </View>
      ) : (
        <Button label="Generate transfer code" busy={working} onPress={() => void generate()} />
      )}

      <Divider />

      <Body muted>Have a code from another device?</Body>
      <TextInput
        value={entry}
        onChangeText={(text) => setEntry(formatCode(text))}
        placeholder="XXXX-XXXX-XXXX"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={14}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundSelected },
        ]}
      />
      <Button
        label="Redeem code"
        variant="secondary"
        disabled={entry.replace(/[^0-9A-Z]/g, '').length !== 12}
        busy={working}
        onPress={() => void redeem()}
      />

      {message && <Body>{message}</Body>}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two },
  codeBlock: { gap: Spacing.two, alignItems: 'center', paddingVertical: Spacing.two },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    letterSpacing: 2,
  },
});
