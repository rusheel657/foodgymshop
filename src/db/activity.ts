import { all, run, write } from '@/db/db';
import { finishedWorkouts } from '@/db/gym';
import { addDays } from '@/lib/history';
import { dayBurn, type Burn } from '@/lib/burn';
import { volume } from '@/lib/gym';
import { ageOn, bmrOf, type Targets } from '@/lib/targets';
import { localDate, targetsFor, type Profile } from '@/db/profile';

// Each day's calorie target from what you actually did: steps (Health Connect) + workouts logged in the Gym tab.
// Days with no step data fall back to the profile's activity level.

export type DayTargets = Targets & { burn: Burn | null };

/** Stores steps per local day ("YYYY-MM-DD" → steps), replacing what was stored from `from` on (days Health Connect
 *  has nothing for are cleared, so earlier wrong values don't linger). */
export async function saveSteps(days: Map<string, number>, from?: string) {
  const now = new Date().toISOString();
  await write(['daily_steps'], async () => {
    if (from) await run('UPDATE daily_steps SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id >= ? AND deleted_at IS NULL', [now, now, from]);
    for (const [date, steps] of days) {
      await run(
        `INSERT INTO daily_steps (id, updated_at, dirty, steps) VALUES (?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET steps = excluded.steps, updated_at = excluded.updated_at, dirty = 1, deleted_at = NULL`,
        [date, now, Math.round(steps)],
      );
    }
  });
}

const localStart = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};

/** Targets for each date. Today counts the steps walked so far, so its target grows as you walk. */
export async function dayTargets(profile: Profile, dates: string[], today = localDate()): Promise<Map<string, DayTargets>> {
  const out = new Map<string, DayTargets>();
  if (dates.length === 0) return out;
  const sorted = [...dates].sort();
  const [from, to] = [addDays(sorted[0] < today ? sorted[0] : today, -7), addDays(sorted[sorted.length - 1], 1)];
  const steps = new Map(
    (await all<{ id: string; steps: number }>('SELECT id, steps FROM daily_steps WHERE deleted_at IS NULL AND id >= ? AND id < ?', [from, to]))
      .map((r) => [r.id, r.steps]),
  );
  const workouts = await finishedWorkouts(localStart(from), localStart(to));
  for (const date of dates) {
    const when = new Date(`${date}T12:00`);
    // Today with no steps recorded yet is 0 steps, as long as Health Connect has been sending steps lately.
    const recent = [1, 2, 3, 4, 5, 6, 7].some((n) => steps.has(addDays(today, -n)));
    const walked = steps.get(date) ?? (date === today && recent ? 0 : null);
    if (walked === null) {
      out.set(date, { ...targetsFor(profile, when), burn: null });
      continue;
    }
    const burn = dayBurn({
      bmr: bmrOf({ sex: profile.sex, age: ageOn(profile.birthDate, when), heightCm: profile.heightCm, weightKg: profile.weightKg }),
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      steps: walked,
      workouts: workouts
        .filter((w) => localDate(new Date(w.startedAt)) === date)
        .map((w) => ({
          minutes: (Date.parse(w.endedAt!) - Date.parse(w.startedAt)) / 60_000,
          volumeKg: volume(w.sets.map((x) => ({ ...x, done: !!x.completedAt }))),
        })),
    });
    out.set(date, { ...targetsFor(profile, when, burn.total), burn });
  }
  return out;
}
