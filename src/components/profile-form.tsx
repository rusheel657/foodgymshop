import { useState } from 'react';

import { Button, Field, NumberInput, num, Segmented } from '@/components/ui';
import { localDate, targetsFor, type Profile } from '@/db/profile';
import { ACTIVITY_LEVELS, ageOn, RATES, type Goal, type Sex } from '@/lib/targets';

type Draft = {
  sex: Sex | null;
  birthDate: string;
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
  const [d, setD] = useState<Draft>({
    sex: initial?.sex ?? null,
    birthDate: initial?.birthDate ?? '',
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
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const result = validate(d);
  const profile = typeof result === 'string' ? null : result;
  const targets = profile && targetsFor(profile);
  const autoKcal = profile && targetsFor({ ...profile, calorieOverride: null }).kcal;

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
    <div className="stack">
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
        <span className="input">
          <input
            type="date"
            aria-label="Birth date"
            value={d.birthDate}
            max={localDate()}
            onChange={(e) => set({ birthDate: e.target.value })}
          />
        </span>
      </Field>

      <div className="row">
        <Field label="Height">
          <NumberInput label="Height" value={d.height} onChange={(height) => set({ height })} suffix="cm" />
        </Field>
        <Field label="Weight">
          <NumberInput label="Weight" value={d.weight} onChange={(weight) => set({ weight })} suffix="kg" />
        </Field>
      </div>

      <Field label="Activity" hint={`${ACTIVITY_LEVELS.find((a) => a.value === d.activity)?.hint ?? ''}. Only used on days without step data from Health Connect.`}>
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
              onChange={(goalWeight) => set({ goalWeight })}
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
        <input
          type="range"
          aria-label="Protein grams per pound"
          min={0.8}
          max={1}
          step={0.05}
          value={d.protein}
          onChange={(e) => set({ protein: Number(e.target.value) })}
        />
      </Field>

      <Field
        label={`Carbs ${Math.round(d.carbRatio * 100)}% · Fat ${Math.round((1 - d.carbRatio) * 100)}%`}
        hint={targets ? `${targets.carbs} g carbs · ${targets.fat} g fat` : 'Of the calories left after protein'}>
        <input
          type="range"
          aria-label="Carbs to fat ratio"
          min={0.2}
          max={0.8}
          step={0.05}
          value={d.carbRatio}
          onChange={(e) => set({ carbRatio: Number(e.target.value) })}
        />
      </Field>

      <Field label="Calories" hint="Leave empty to use the calculated target.">
        <NumberInput
          label="Calorie target override"
          value={d.override}
          onChange={(override) => set({ override })}
          placeholder={autoKcal ? `${autoKcal} (auto)` : 'Auto'}
          suffix="kcal"
        />
      </Field>

      <div className="card">
        {targets ? (
          <>
            <h2>{targets.kcal} kcal</h2>
            <p className="muted">
              P {targets.protein} g · C {targets.carbs} g · F {targets.fat} g
            </p>
            <p className="small muted">Maintenance ≈ {targets.maintenance} kcal from your activity level. With Health Connect, the Food tab shows each day's target from your steps and workouts.</p>
          </>
        ) : (
          <p className="muted">{result as string}</p>
        )}
      </div>

      <Button title={submitLabel} onClick={submit} disabled={!profile} busy={busy} />
    </div>
  );
}
