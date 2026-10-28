import { useState } from 'react';
import { StyleSheet, Switch } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getThemePref, setThemePref } from '@/lib/theme-pref';

export default function ProfileScreen() {
  const colors = useTheme();
  const [light, setLight] = useState(getThemePref() === 'light');

  return (
    <Screen title="Profile">
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
