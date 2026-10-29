import { first, run, write } from '@/db/db';
import { ageOn, computeTargets, type Goal, type Sex, type Targets } from '@/lib/targets';

export type Profile = {
  sex: Sex;
  birthDate: string; // YYYY-MM-DD
  heightCm: number;
  weightKg: number; // latest weight_logs entry
  activity: number;
  goal: Goal;
  goalWeightKg: number | null;
  rateKgWeek: number;
  proteinGPerLb: number;
  carbRatio: number;
  calorieOverride: number | null;
};

type Row = {
  sex: Sex;
  birth_date: string;
  height_cm: number;
  activity_level: number;
  goal: Goal;
  goal_weight_kg: number | null;
  rate_kg_week: number;
  protein_g_per_lb: number;
  carb_ratio: number;
  calorie_override: number | null;
  weight_kg: number | null;
};

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function targetsFor(p: Profile, today = new Date()): Targets {
  return computeTargets({
    sex: p.sex,
    age: ageOn(p.birthDate, today),
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    activity: p.activity,
    goal: p.goal,
    rateKgWeek: p.rateKgWeek,
    proteinGPerLb: p.proteinGPerLb,
    carbRatio: p.carbRatio,
    calorieOverride: p.calorieOverride,
  });
}

// One profile row per user, keyed by the user's id.
export async function loadProfile(userId: string): Promise<Profile | null> {
  const r = await first<Row>(
    `SELECT p.*, (SELECT w.weight_kg FROM weight_logs w
                  WHERE w.user_id = p.id AND w.deleted_at IS NULL
                  ORDER BY w.date DESC LIMIT 1) AS weight_kg
     FROM profile p WHERE p.id = ? AND p.deleted_at IS NULL`,
    [userId],
  );
  if (!r || r.weight_kg == null) return null;
  return {
    sex: r.sex,
    birthDate: r.birth_date,
    heightCm: r.height_cm,
    weightKg: r.weight_kg,
    activity: r.activity_level,
    goal: r.goal,
    goalWeightKg: r.goal_weight_kg,
    rateKgWeek: r.rate_kg_week,
    proteinGPerLb: r.protein_g_per_lb,
    carbRatio: r.carb_ratio,
    calorieOverride: r.calorie_override,
  };
}

/** Upserts the profile; logs today's weight only when it changed. */
export async function saveProfile(userId: string, p: Profile, previousWeightKg?: number) {
  const now = new Date().toISOString();
  await write(['profile', 'weight_logs'], async () => {
    await run(
      `INSERT INTO profile (id, user_id, updated_at, dirty, sex, birth_date, height_cm, activity_level, goal,
                            goal_weight_kg, rate_kg_week, protein_g_per_lb, carb_ratio, calorie_override)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         updated_at = excluded.updated_at, dirty = 1, deleted_at = NULL,
         sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
         activity_level = excluded.activity_level, goal = excluded.goal, goal_weight_kg = excluded.goal_weight_kg,
         rate_kg_week = excluded.rate_kg_week, protein_g_per_lb = excluded.protein_g_per_lb,
         carb_ratio = excluded.carb_ratio, calorie_override = excluded.calorie_override`,
      [userId, userId, now, p.sex, p.birthDate, p.heightCm, p.activity, p.goal,
        p.goalWeightKg, p.rateKgWeek, p.proteinGPerLb, p.carbRatio, p.calorieOverride],
    );
    if (p.weightKg !== previousWeightKg) {
      await run(
        `INSERT INTO weight_logs (id, user_id, updated_at, dirty, date, weight_kg) VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET
           weight_kg = excluded.weight_kg, updated_at = excluded.updated_at, dirty = 1, deleted_at = NULL`,
        [crypto.randomUUID(), userId, now, localDate(), p.weightKg],
      );
    }
  });
}
