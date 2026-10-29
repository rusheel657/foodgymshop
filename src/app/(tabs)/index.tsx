import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';

export default function FoodScreen() {
  const { profile } = useAccount();
  const t = profile && targetsFor(profile);

  return (
    <Screen title="Today">
      {t && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">{t.kcal} kcal</ThemedText>
          <View style={styles.macros}>
            <Macro label="Protein" grams={t.protein} />
            <Macro label="Carbs" grams={t.carbs} />
            <Macro label="Fat" grams={t.fat} />
          </View>
        </ThemedView>
      )}
      <EmptyState text="No food logged yet." />
    </Screen>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <View style={styles.macro}>
      <ThemedText type="smallBold">{grams} g</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.three },
  macros: { flexDirection: 'row' },
  macro: { flex: 1 },
});
