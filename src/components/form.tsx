import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      {children}
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  vertical,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  vertical?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.segmented, vertical && styles.vertical, { borderColor: colors.border }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: colors.text }]}>
            <ThemedText type="small" style={selected && { color: colors.background }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NumberInput({
  label,
  value,
  onChangeText,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.input, { backgroundColor: colors.backgroundElement }]}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.inputText, { color: colors.text }]}
      />
      {suffix && <ThemedText themeColor="textSecondary">{suffix}</ThemedText>}
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const colors = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.button,
        primary ? { backgroundColor: colors.text } : { borderColor: colors.border, borderWidth: 1 },
        disabled && styles.disabled,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? colors.background : colors.text} />
      ) : (
        <ThemedText style={primary && { color: colors.background }}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

/** Parses "72,5" or "72.5"; NaN when empty or invalid. */
export const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: Spacing.three, overflow: 'hidden' },
  vertical: { flexDirection: 'column' },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  inputText: { flex: 1, height: 48, fontSize: 16 },
  button: { height: 52, borderRadius: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
