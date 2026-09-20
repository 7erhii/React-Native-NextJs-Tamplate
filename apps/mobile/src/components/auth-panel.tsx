/**
 * Shared sign-in affordances.
 *
 * Google is wired today through IdentityPort. Email/password is a reserved
 * slot: the buttons exist in the route structure (/sign-in, /sign-up) so a
 * later provider does not need new screens, but this panel will not fake a
 * working email form.
 */

import { useRouter } from 'expo-router';

import { appConfig } from '@/config/app.config';
import { Body, Button, Card, Subheading } from '@/components/ui';
import { useIdentity } from '@/platform/use-identity';

export function AuthPanel({ intent }: { intent: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const capabilities = useIdentity((state) => state.capabilities);
  const busy = useIdentity((state) => state.busy);
  const error = useIdentity((state) => state.error);
  const signIn = useIdentity((state) => state.signIn);
  const google = capabilities.providers.includes('google');

  const title = intent === 'sign-up' ? 'Create an account' : 'Sign in';
  const googleLabel =
    intent === 'sign-up' ? 'Continue with Google' : 'Sign in with Google';

  return (
    <Card>
      <Subheading>{title}</Subheading>
      <Body muted>
        The same account is used on the website and in the app. Google is the
        provider that is wired today; email/password plugs into the same identity
        port later without new screens.
      </Body>

      {google ? (
        <Button
          label={googleLabel}
          busy={busy}
          onPress={async () => {
            const outcome = await signIn('google');
            if (outcome?.status === 'signed-in' || outcome?.status === 'upgraded') {
              router.replace('/home');
            }
          }}
        />
      ) : (
        <Body muted>
          identity.mode is &ldquo;{appConfig.identity.mode}&rdquo;, which has no
          account provider. Set it to &ldquo;google&rdquo; in packages/config/src/app.config.ts
          to enable sign-in.
        </Body>
      )}

      {error ? <Body>{error}</Body> : null}
    </Card>
  );
}
