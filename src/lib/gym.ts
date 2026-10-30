// Pure gym maths (plan.md §3). No imports, so node:test can run it directly.

export type SetLike = { weightKg: number | null; reps: number | null; isWarmup: boolean; done: boolean };

/** Estimated one-rep max (Epley). A single rep is its own max. */
export function epley(weightKg: number, reps: number) {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Σ weight × reps of completed working sets. */
export function volume(sets: SetLike[]) {
  return sets.reduce((v, s) => (s.done && !s.isWarmup ? v + (s.weightKg ?? 0) * (s.reps ?? 0) : v), 0);
}

const round = (kg: number, step: number) => Math.round(kg / step) * step;

/** Warm-ups before a first working set of `workKg`: 50%×10, 70%×5, 85%×3, rounded to 2.5 kg.
 *  Sets lighter than the empty bar, or not lighter than the working set, are dropped. */
export function warmups(workKg: number, barKg = 20): { weightKg: number; reps: number }[] {
  const out: { weightKg: number; reps: number }[] = [];
  for (const [pct, reps] of [[0.5, 10], [0.7, 5], [0.85, 3]]) {
    const weightKg = round(workKg * pct, 2.5);
    if (weightKg >= barKg && weightKg < workKg && !out.some((s) => s.weightKg === weightKg)) out.push({ weightKg, reps });
  }
  return out;
}

/** "42:07" or "1:02:03". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)];
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Exercise order + number of working sets per exercise; equal shapes mean the template doesn't need updating. */
export function shape(exercises: { exerciseId: string; sets: { isWarmup: boolean }[] }[]) {
  return exercises.map((e) => `${e.exerciseId}×${e.sets.filter((s) => !s.isWarmup).length}`).join(',');
}
