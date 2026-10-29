import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/supabase';

export default function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setError(null);
    setError(await signInWithGoogle().catch((e: Error) => e.message));
    setBusy(false);
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.content}>
        <View style={styles.hero}>
          <ThemedText type="subtitle">Food · Gym · Shop</ThemedText>
          <ThemedText themeColor="textSecondary">Track meals, lifts and groceries.</ThemedText>
        </View>
        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <Button title="Continue with Google" onPress={onPress} busy={busy} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, padding: Spacing.four, justifyContent: 'flex-end', gap: Spacing.three },
  hero: { flex: 1, justifyContent: 'center', gap: Spacing.two },
  error: { textAlign: 'center' },
});
