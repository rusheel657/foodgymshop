import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Field, NumberInput, num, Segmented } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { localDate, targetsFor, type Profile } from '@/db/profile';
import { useTheme } from '@/hooks/use-theme';
import { ACTIVITY_LEVELS, ageOn, RATES, type Goal, type Sex } from '@/lib/targets';

type Draft = {
  sex: Sex | null;
  birthDate: string | null;
  height: string;
  weight: string;
  activity: number;
  goal: Goal | null;
  goalWeight: string;
  rate: number;
  protein: number;
  carbRatio: number;
  override: string;
};

const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

/** A valid Profile, or the first thing that still needs fixing. */
function validate(d: Draft): Profile | string {
  if (!d.sex) return 'Choose your sex.';
  if (!d.birthDate || !between(ageOn(d.birthDate, new Date()), 13, 100)) return 'Pick your birth date.';
  const heightCm = num(d.height);
  if (!between(heightCm, 100, 250)) return 'Height must be 100–250 cm.';
  const weightKg = num(d.weight);
  if (!between(weightKg, 30, 300)) return 'Weight must be 30–300 kg.';
  if (!d.goal) return 'Choose a goal.';
  const goalWeightKg = d.goal === 'maintain' ? null : num(d.goalWeight);
  if (goalWeightKg !== null && !between(goalWeightKg, 30, 300)) return 'Goal weight must be 30–300 kg.';
  const calorieOverride = d.override.trim() === '' ? null : Math.round(num(d.override));
  if (calorieOverride !== null && !between(calorieOverride, 800, 6000)) return 'Calories must be 800–6000.';
  return {
    sex: d.sex,
    birthDate: d.birthDate,
    heightCm,
    weightKg,
    activity: d.activity,
    goal: d.goal,
    goalWeightKg,
    rateKgWeek: d.rate,
    proteinGPerLb: d.protein,
    carbRatio: d.carbRatio,
    calorieOverride,
  };
}

const str = (n?: number | null) => (n == null ? '' : String(n));

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Profile | null;
  submitLabel: string;
  onSubmit: (profile: Profile) => Promise<void>;
}) {
  const colors = useTheme();
  const [d, setD] = useState<Draft>({
    sex: initial?.sex ?? null,
    birthDate: initial?.birthDate ?? null,
    height: str(initial?.heightCm),
    weight: str(initial?.weightKg),
    activity: initial?.activity ?? 1.55,
    goal: initial?.goal ?? null,
    goalWeight: str(initial?.goalWeightKg),
    rate: initial?.rateKgWeek ?? 0.5,
    protein: initial?.proteinGPerLb ?? 1,
    carbRatio: initial?.carbRatio ?? 0.6,
    override: str(initial?.calorieOverride),
  });
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const result = validate(d);
  const profile = typeof result === 'string' ? null : result;
  const targets = profile && targetsFor(profile);
  const autoKcal = profile && targetsFor({ ...profile, calorieOverride: null }).kcal;
  const sliderColors = {
    minimumTrackTintColor: colors.text,
    maximumTrackTintColor: colors.border,
    thumbTintColor: colors.text,
  };

  async function submit() {
    if (!profile) return;
    setBusy(true);
    try {
      await onSubmit(profile);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <Field label="Sex">
        <Segmented
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
          value={d.sex}
          onChange={(sex) => set({ sex })}
        />
      </Field>

      <Field label="Birth date">
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPicker(true)}
          style={[styles.dateButton, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText themeColor={d.birthDate ? 'text' : 'textSecondary'}>{d.birthDate ?? 'Select'}</ThemedText>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            mode="date"
            value={d.birthDate ? new Date(`${d.birthDate}T12:00:00`) : new Date(2000, 0, 1)}
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowPicker(false);
              if (event.type === 'set' && date) set({ birthDate: localDate(date) });
            }}
          />
        )}
      </Field>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Height">
            <NumberInput label="Height" value={d.height} onChangeText={(height) => set({ height })} suffix="cm" />
          </Field>
        </View>
        <View style={styles.flex}>
          <Field label="Weight">
            <NumberInput label="Weight" value={d.weight} onChangeText={(weight) => set({ weight })} suffix="kg" />
          </Field>
        </View>
      </View>

      <Field label="Activity" hint={ACTIVITY_LEVELS.find((a) => a.value === d.activity)?.hint}>
        <Segmented vertical options={ACTIVITY_LEVELS} value={d.activity} onChange={(activity) => set({ activity })} />
      </Field>

      <Field label="Goal">
        <Segmented
          options={[
            { value: 'lose', label: 'Lose' },
            { value: 'maintain', label: 'Maintain' },
            { value: 'gain', label: 'Gain' },
          ]}
          value={d.goal}
          onChange={(goal) => set({ goal })}
        />
      </Field>

      {d.goal && d.goal !== 'maintain' && (
        <>
          <Field label="Goal weight">
            <NumberInput
              label="Goal weight"
              value={d.goalWeight}
              onChangeText={(goalWeight) => set({ goalWeight })}
              suffix="kg"
            />
          </Field>
          <Field label={d.goal === 'lose' ? 'Lose per week' : 'Gain per week'}>
            <Segmented
              options={RATES.map((r) => ({ value: r, label: `${r} kg` }))}
              value={d.rate}
              onChange={(rate) => set({ rate })}
            />
          </Field>
        </>
      )}

      <Field
        label={`Protein · ${d.protein.toFixed(2)} g per lb`}
        hint={targets ? `${targets.protein} g per day` : undefined}>
        <Slider
          accessibilityLabel="Protein grams per pound"
          minimumValue={0.8}
          maximumValue={1}
          step={0.05}
          value={d.protein}
          onValueChange={(protein) => set({ protein })}
          {...sliderColors}
        />
      </Field>

      <Field
        label={`Carbs ${Math.round(d.carbRatio * 100)}% · Fat ${Math.round((1 - d.carbRatio) * 100)}%`}
        hint={targets ? `${targets.carbs} g carbs · ${targets.fat} g fat` : 'Of the calories left after protein'}>
        <Slider
          accessibilityLabel="Carbs to fat ratio"
          minimumValue={0.2}
          maximumValue={0.8}
          step={0.05}
          value={d.carbRatio}
          onValueChange={(carbRatio) => set({ carbRatio })}
          {...sliderColors}
        />
      </Field>

      <Field label="Calories" hint="Leave empty to use the calculated target.">
        <NumberInput
          label="Calorie target override"
          value={d.override}
          onChangeText={(override) => set({ override })}
          placeholder={autoKcal ? `${autoKcal} (auto)` : 'Auto'}
          suffix="kcal"
        />
      </Field>

      <ThemedView type="backgroundElement" style={styles.summary}>
        {targets ? (
          <>
            <ThemedText type="subtitle">{targets.kcal} kcal</ThemedText>
            <ThemedText themeColor="textSecondary">
              P {targets.protein} g · C {targets.carbs} g · F {targets.fat} g
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Maintenance ≈ {targets.maintenance} kcal
            </ThemedText>
          </>
        ) : (
          <ThemedText themeColor="textSecondary">{result as string}</ThemedText>
        )}
      </ThemedView>

      <Button title={submitLabel} onPress={submit} disabled={!profile} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  dateButton: { height: 48, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  summary: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
});
