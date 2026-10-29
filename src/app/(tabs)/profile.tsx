import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, Switch } from 'react-native';

import { Button } from '@/components/form';
import { ProfileForm } from '@/components/profile-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { saveProfile } from '@/db/profile';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';
import { supabase } from '@/lib/supabase';
import { getThemePref, setThemePref } from '@/lib/theme-pref';

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { userId, email, profile } = useAccount();
  const [light, setLight] = useState(getThemePref() === 'light');

  return (
    <Screen title="Profile">
      <ThemedText themeColor="textSecondary">{email}</ThemedText>

      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText>Light mode</ThemedText>
        <Switch
          accessibilityLabel="Light mode"
          value={light}
          onValueChange={(on) => {
            setLight(on);
            setThemePref(on ? 'light' : 'dark');
          }}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </ThemedView>

      <ProfileForm
        initial={profile}
        submitLabel="Save"
        onSubmit={async (p) => {
          await saveProfile(db, userId, p, profile?.weightKg);
          Alert.alert('Saved');
        }}
      />

      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
