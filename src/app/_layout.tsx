import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Appearance, useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { migrate } from '@/db/migrate';
import { getThemePref } from '@/lib/theme-pref';

Appearance.setColorScheme(getThemePref());

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SQLiteProvider databaseName="app.db" onInit={migrate}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppTabs />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
