import { Link } from 'expo-router';

import { AuthPanel } from '@/components/auth-panel';
import { Body, Heading, Screen } from '@/components/ui';
import { appConfig } from '@/config/app.config';

export default function SignInScreen() {
  return (
    <Screen>
      <Heading>Sign in</Heading>
      <Body muted>
        {appConfig.product.name} uses one account on the website and on the phone.
      </Body>
      <AuthPanel intent="sign-in" />
      <Link href="/sign-up">
        <Body muted>Need an account? Create one →</Body>
      </Link>
    </Screen>
  );
}
