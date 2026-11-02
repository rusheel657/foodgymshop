// Daily calorie + macro targets (plan.md §3). Pure functions: no imports, so `node --test` can load this file directly.

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

export type TargetInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: Goal;
  rateKgWeek: number;
  proteinGPerLb: number;
  carbRatio: number;
  calorieOverride: number | null;
  burnKcal?: number | null; // the day's measured burn (steps + workouts); replaces BMR × activity
};

export type Targets = { maintenance: number; kcal: number; protein: number; carbs: number; fat: number };

const KCAL_PER_KG = 7700;
const LB_PER_KG = 2.20462;

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary', hint: 'Desk job, little exercise' },
  { value: 1.375, label: 'Light', hint: 'Exercise 1–3 days a week' },
  { value: 1.55, label: 'Moderate', hint: 'Exercise 3–5 days a week' },
  { value: 1.725, label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  { value: 1.9, label: 'Extra active', hint: 'Physical job + training' },
] as const;

export const RATES = [0.25, 0.5, 0.75] as const;

export function ageOn(birthDate: string, today: Date): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  return today.getFullYear() - y - (hadBirthday ? 0 : 1);
}

/** Mifflin-St Jeor. */
export function bmrOf(i: { sex: Sex; age: number; heightCm: number; weightKg: number }) {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + (i.sex === 'male' ? 5 : -161);
}

export function computeTargets(i: TargetInput): Targets {
  const maintenance = i.burnKcal ?? bmrOf(i) * i.activity;
  const sign = i.goal === 'lose' ? -1 : i.goal === 'gain' ? 1 : 0;
  const kcal = Math.round(i.calorieOverride ?? maintenance + (sign * i.rateKgWeek * KCAL_PER_KG) / 7);
  const protein = Math.round(i.proteinGPerLb * i.weightKg * LB_PER_KG);
  const rest = Math.max(0, kcal - protein * 4);
  return {
    maintenance: Math.round(maintenance),
    kcal,
    protein,
    carbs: Math.round((rest * i.carbRatio) / 4),
    fat: Math.round((rest * (1 - i.carbRatio)) / 9),
  };
}
