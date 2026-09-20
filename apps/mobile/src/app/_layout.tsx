import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProviders } from '@/platform/providers';
import { useSurfaceState } from '@/platform/use-surface-state';

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppProviders>
        <MobileStack
          headerStyle={theme.background}
          headerTint={theme.text}
          content={theme.background}
        />
      </AppProviders>
    </SafeAreaProvider>
  );
}

function MobileStack({
  headerStyle,
  headerTint,
  content,
}: {
  headerStyle: string;
  headerTint: string;
  content: string;
}) {
  const { showAuthRoutes, showAppRoutes, product } = useSurfaceState();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: headerStyle },
        headerTintColor: headerTint,
        contentStyle: { backgroundColor: content },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={showAuthRoutes}>
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      </Stack.Protected>

      <Stack.Protected guard={showAppRoutes}>
        <Stack.Screen name="home" options={{ title: product.name }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="ui-kit" options={{ title: 'UI kit' }} />
        <Stack.Screen name="play/[gameId]" options={{ title: 'Play' }} />
      </Stack.Protected>
    </Stack>
  );
}
