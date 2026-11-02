// Calories burned in a day from steps and logged workouts. Pure functions: no imports, so node:test can load this file.

/** BMR × 1.2: resting burn plus digesting food and everyday moving about, before any walking or training. */
export const BASE_FACTOR = 1.2;

/** Net walking cost: about 0.5 kcal per kg per km; a step is about 41.5% of your height. */
export function stepKcal(steps: number, weightKg: number, heightCm: number) {
  const km = (steps * 0.415 * heightCm) / 100_000;
  return km * 0.5 * weightKg;
}

/** Weight training: MET 3.5 for a light session up to 6 for a dense, heavy one, judged by volume moved per minute per kg
 *  of body weight. Net of the resting burn already counted in the base. */
export function workoutMet(minutes: number, volumeKg: number, weightKg: number) {
  const density = volumeKg / (weightKg * Math.max(1, minutes));
  return Math.min(6, Math.max(3.5, 3.5 + (density - 0.5)));
}

export function workoutKcal(minutes: number, volumeKg: number, weightKg: number) {
  const m = Math.min(180, Math.max(0, minutes));
  return ((workoutMet(m, volumeKg, weightKg) - 1) * weightKg * m) / 60;
}

export type Burn = { base: number; steps: number; stepKcal: number; workoutKcal: number; workoutMinutes: number; total: number };

export function dayBurn(i: {
  bmr: number;
  weightKg: number;
  heightCm: number;
  steps: number;
  workouts: { minutes: number; volumeKg: number }[];
}): Burn {
  const base = i.bmr * BASE_FACTOR;
  const walk = stepKcal(i.steps, i.weightKg, i.heightCm);
  const lift = i.workouts.reduce((s, w) => s + workoutKcal(w.minutes, w.volumeKg, i.weightKg), 0);
  return {
    base: Math.round(base),
    steps: Math.round(i.steps),
    stepKcal: Math.round(walk),
    workoutKcal: Math.round(lift),
    workoutMinutes: Math.round(i.workouts.reduce((s, w) => s + Math.min(180, w.minutes), 0)),
    total: Math.round(base + walk + lift),
  };
}
