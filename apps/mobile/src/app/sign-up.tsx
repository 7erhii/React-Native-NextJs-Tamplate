import { Link } from 'expo-router';

import { AuthPanel } from '@/components/auth-panel';
import { Body, Heading, Screen } from '@/components/ui';
import { appConfig } from '@/config/app.config';

export default function SignUpScreen() {
  return (
    <Screen>
      <Heading>Create account</Heading>
      <Body muted>
        {appConfig.product.name} will use this account in the app as well. Google
        is wired today; email/password is the next provider on the same port.
      </Body>
      <AuthPanel intent="sign-up" />
      <Link href="/sign-in">
        <Body muted>Already have an account? Sign in →</Body>
      </Link>
    </Screen>
  );
}
