import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Appearance, useColorScheme } from 'react-native';

import { migrate } from '@/db/migrate';
import { AccountProvider, useProfile, useSession } from '@/lib/account';
import { getThemePref } from '@/lib/theme-pref';

Appearance.setColorScheme(getThemePref());

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SQLiteProvider databaseName="app.db" onInit={migrate} options={{ enableChangeListener: true }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootStack />
      </ThemeProvider>
    </SQLiteProvider>
  );
}

function RootStack() {
  const session = useSession();
  const profile = useProfile(session?.user.id);
  if (session === undefined || (session && profile === undefined)) return null;

  const signedIn = session !== null;
  const onboarded = !!profile;
  return (
    <AccountProvider
      value={session && { userId: session.user.id, email: session.user.email, profile: profile ?? null }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </AccountProvider>
  );
}
