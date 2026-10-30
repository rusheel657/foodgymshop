import builtIn from '@/data/exercises.json';
import { all, run, write } from '@/db/db';

// Gym: exercises (bundled free-exercise-db + the user's own), templates, and workouts.
// Built-in exercises live only in the bundled JSON; the exercises table holds custom ones.

export type Exercise = { id: string; name: string; muscle: string; equipment: string; image: string | null; custom: boolean };

export type TemplateSet = { reps: number | null; weightKg: number | null; isWarmup: boolean };
export type TemplateExercise = { exerciseId: string; restS: number; sets: TemplateSet[] };
export type Template = { id: string; name: string; exercises: TemplateExercise[] };

export type WorkoutSet = {
  id: string; exerciseId: string; exerciseOrder: number; setOrder: number;
  weightKg: number | null; reps: number | null; isWarmup: boolean; completedAt: string | null;
};
export type Workout = { id: string; templateId: string | null; startedAt: string; endedAt: string | null; sets: WorkoutSet[] };

export const DEFAULT_REST_S = 120;
export const MUSCLES = [...new Set(builtIn.map((e) => e.muscle))].sort();
export const imageUrl = (path: string) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${path}`;

const BUILT_IN: Exercise[] = builtIn.map((e) => ({ ...e, custom: false }));
const now = () => new Date().toISOString();

export async function listExercises(): Promise<Exercise[]> {
  const custom = await all<{ id: string; name: string; primary_muscle: string; equipment: string }>(
    'SELECT id, name, primary_muscle, equipment FROM exercises WHERE deleted_at IS NULL AND is_custom = 1',
  );
  return [
    ...custom.map((c) => ({ id: c.id, name: c.name, muscle: c.primary_muscle, equipment: c.equipment, image: null, custom: true })),
    ...BUILT_IN,
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveCustomExercise(userId: string, e: { name: string; muscle: string; equipment: string }) {
  const id = crypto.randomUUID();
  await write(['exercises'], () =>
    run(
      'INSERT INTO exercises (id, user_id, updated_at, dirty, name, primary_muscle, equipment, is_custom) VALUES (?, ?, ?, 1, ?, ?, ?, 1)',
      [id, userId, now(), e.name, e.muscle, e.equipment],
    ),
  );
  return id;
}

// ---- Templates ----

export async function listTemplates(): Promise<Template[]> {
  const templates = await all<{ id: string; name: string }>(
    'SELECT id, name FROM templates WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
  );
  const tes = await all<{ id: string; template_id: string; exercise_id: string; rest_s: number }>(
    'SELECT id, template_id, exercise_id, rest_s FROM template_exercises WHERE deleted_at IS NULL ORDER BY sort_order',
  );
  const sets = await all<{ template_exercise_id: string; reps: number | null; weight_kg: number | null; is_warmup: number }>(
    'SELECT template_exercise_id, reps, weight_kg, is_warmup FROM template_sets WHERE deleted_at IS NULL ORDER BY sort_order',
  );
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    exercises: tes
      .filter((te) => te.template_id === t.id)
      .map((te) => ({
        exerciseId: te.exercise_id,
        restS: te.rest_s,
        sets: sets
          .filter((s) => s.template_exercise_id === te.id)
          .map((s) => ({ reps: s.reps, weightKg: s.weight_kg, isWarmup: !!s.is_warmup })),
      })),
  }));
}

async function softDeleteTemplateChildren(templateId: string, at: string) {
  await run(
    `UPDATE template_sets SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND template_exercise_id IN
       (SELECT id FROM template_exercises WHERE template_id = ?)`,
    [at, at, templateId],
  );
  await run('UPDATE template_exercises SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE template_id = ? AND deleted_at IS NULL', [at, at, templateId]);
}

/** Upserts the template and replaces its exercises and sets. */
export async function saveTemplate(userId: string, t: Template) {
  const at = now();
  await write(['templates', 'template_exercises', 'template_sets'], async () => {
    await run(
      `INSERT INTO templates (id, user_id, updated_at, dirty, name) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, dirty = 1, name = excluded.name`,
      [t.id, userId, at, t.name],
    );
    await softDeleteTemplateChildren(t.id, at);
    for (const [i, e] of t.exercises.entries()) {
      const teId = crypto.randomUUID();
      await run(
        'INSERT INTO template_exercises (id, user_id, updated_at, dirty, template_id, exercise_id, sort_order, rest_s) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
        [teId, userId, at, t.id, e.exerciseId, i, e.restS],
      );
      for (const [j, s] of e.sets.entries()) {
        await run(
          'INSERT INTO template_sets (id, user_id, updated_at, dirty, template_exercise_id, sort_order, reps, weight_kg, is_warmup) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), userId, at, teId, j, s.reps, s.weightKg, s.isWarmup ? 1 : 0],
        );
      }
    }
  });
}

export async function deleteTemplate(id: string) {
  const at = now();
  await write(['templates', 'template_exercises', 'template_sets'], async () => {
    await run('UPDATE templates SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [at, at, id]);
    await softDeleteTemplateChildren(id, at);
  });
}

// ---- Workouts ----

type SetRow = {
  id: string; workout_id: string; exercise_id: string; exercise_order: number; set_order: number;
  weight_kg: number | null; reps: number | null; is_warmup: number; completed_at: string | null;
};
const toSet = (r: SetRow): WorkoutSet => ({
  id: r.id, exerciseId: r.exercise_id, exerciseOrder: r.exercise_order, setOrder: r.set_order,
  weightKg: r.weight_kg, reps: r.reps, isWarmup: !!r.is_warmup, completedAt: r.completed_at,
});

async function loadWorkouts(where: string, params: unknown[] = []): Promise<Workout[]> {
  const ws = await all<{ id: string; template_id: string | null; started_at: string; ended_at: string | null }>(
    `SELECT id, template_id, started_at, ended_at FROM workouts WHERE deleted_at IS NULL AND ${where}`,
    params,
  );
  if (ws.length === 0) return [];
  const sets = await all<SetRow>(
    `SELECT * FROM workout_sets WHERE deleted_at IS NULL AND workout_id IN (${ws.map(() => '?').join(',')})
     ORDER BY exercise_order, set_order`,
    ws.map((w) => w.id),
  );
  return ws.map((w) => ({
    id: w.id, templateId: w.template_id, startedAt: w.started_at, endedAt: w.ended_at,
    sets: sets.filter((s) => s.workout_id === w.id).map(toSet),
  }));
}

/** The unfinished workout, if any (survives the app being killed). */
export async function activeWorkout(): Promise<Workout | null> {
  return (await loadWorkouts('ended_at IS NULL ORDER BY started_at DESC LIMIT 1'))[0] ?? null;
}

export const getWorkout = async (id: string) => (await loadWorkouts('id = ?', [id]))[0] ?? null;

/** Completed sets from the most recent finished workout that had each exercise ("Previous" column, pre-fill). */
export async function previousSets(exerciseIds: string[]): Promise<Map<string, WorkoutSet[]>> {
  const out = new Map<string, WorkoutSet[]>();
  if (exerciseIds.length === 0) return out;
  const rows = await all<SetRow & { started_at: string }>(
    `SELECT s.*, w.started_at FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL
       AND s.exercise_id IN (${exerciseIds.map(() => '?').join(',')})
     ORDER BY w.started_at DESC, s.set_order`,
    exerciseIds,
  );
  const fromWorkout = new Map<string, string>();
  for (const r of rows) {
    if (!fromWorkout.has(r.exercise_id)) fromWorkout.set(r.exercise_id, r.workout_id);
    if (fromWorkout.get(r.exercise_id) === r.workout_id) out.set(r.exercise_id, [...(out.get(r.exercise_id) ?? []), toSet(r)]);
  }
  return out;
}

const SET_INSERT =
  `INSERT INTO workout_sets (id, user_id, updated_at, dirty, workout_id, exercise_id, exercise_order, set_order, weight_kg, reps, is_warmup)
   VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`;

/** Starts a workout from a template (or empty). Weights/reps come from last time where there is one, else the template. */
export async function startWorkout(userId: string, template: Template | null) {
  const id = crypto.randomUUID();
  const at = now();
  const prev = await previousSets(template?.exercises.map((e) => e.exerciseId) ?? []);
  await write(['workouts', 'workout_sets'], async () => {
    await run('INSERT INTO workouts (id, user_id, updated_at, dirty, template_id, started_at) VALUES (?, ?, ?, 1, ?, ?)', [
      id, userId, at, template?.id ?? null, at,
    ]);
    for (const [i, e] of (template?.exercises ?? []).entries()) {
      const last = prev.get(e.exerciseId)?.filter((s) => !s.isWarmup) ?? [];
      let working = 0;
      for (const [j, s] of e.sets.entries()) {
        const p = s.isWarmup ? undefined : last[working++];
        await run(SET_INSERT, [crypto.randomUUID(), userId, at, id, e.exerciseId, i, j, p?.weightKg ?? s.weightKg, p?.reps ?? s.reps, s.isWarmup ? 1 : 0]);
      }
    }
  });
  return id;
}

export async function updateSet(id: string, patch: { weightKg?: number | null; reps?: number | null; isWarmup?: boolean; completedAt?: string | null }) {
  const cols = { weightKg: 'weight_kg', reps: 'reps', isWarmup: 'is_warmup', completedAt: 'completed_at' } as const;
  const keys = Object.keys(patch) as (keyof typeof cols)[];
  await write(['workout_sets'], () =>
    run(
      `UPDATE workout_sets SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')}, updated_at = ?, dirty = 1 WHERE id = ?`,
      [...keys.map((k) => (k === 'isWarmup' ? (patch[k] ? 1 : 0) : patch[k])), now(), id],
    ),
  );
}

/** Appends a set to an exercise, copying the weight/reps of `like` (the set above, or last time's). */
export async function addSet(userId: string, w: Workout, exerciseId: string, exerciseOrder: number, like?: { weightKg: number | null; reps: number | null }) {
  const setOrder = Math.max(-1, ...w.sets.filter((s) => s.exerciseOrder === exerciseOrder).map((s) => s.setOrder)) + 1;
  await write(['workout_sets'], () =>
    run(SET_INSERT, [crypto.randomUUID(), userId, now(), w.id, exerciseId, exerciseOrder, setOrder, like?.weightKg ?? null, like?.reps ?? null, 0]),
  );
}

export async function removeSet(id: string) {
  const at = now();
  await write(['workout_sets'], () => run('UPDATE workout_sets SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [at, at, id]));
}

/** Adds an exercise at the end with one set, pre-filled from last time. */
export async function addExercise(userId: string, w: Workout, exerciseId: string) {
  const exerciseOrder = Math.max(-1, ...w.sets.map((s) => s.exerciseOrder)) + 1;
  const last = (await previousSets([exerciseId])).get(exerciseId)?.find((s) => !s.isWarmup);
  await addSet(userId, w, exerciseId, exerciseOrder, last);
}

export async function removeExercise(workoutId: string, exerciseOrder: number) {
  const at = now();
  await write(['workout_sets'], () =>
    run(
      'UPDATE workout_sets SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE workout_id = ? AND exercise_order = ? AND deleted_at IS NULL',
      [at, at, workoutId, exerciseOrder],
    ),
  );
}

/** Inserts warm-up sets before an exercise's existing sets. */
export async function insertWarmups(userId: string, w: Workout, exerciseId: string, exerciseOrder: number, sets: { weightKg: number; reps: number }[]) {
  const at = now();
  await write(['workout_sets'], async () => {
    await run(
      'UPDATE workout_sets SET set_order = set_order + ?, updated_at = ?, dirty = 1 WHERE workout_id = ? AND exercise_order = ? AND deleted_at IS NULL',
      [sets.length, at, w.id, exerciseOrder],
    );
    for (const [i, s] of sets.entries()) {
      await run(SET_INSERT, [crypto.randomUUID(), userId, at, w.id, exerciseId, exerciseOrder, i, s.weightKg, s.reps, 1]);
    }
  });
}

/** Ends the workout; sets never ticked are dropped. */
export async function finishWorkout(id: string) {
  const at = now();
  await write(['workouts', 'workout_sets'], async () => {
    await run('UPDATE workout_sets SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE workout_id = ? AND completed_at IS NULL AND deleted_at IS NULL', [at, at, id]);
    await run('UPDATE workouts SET ended_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [at, at, id]);
  });
}

export async function discardWorkout(id: string) {
  const at = now();
  await write(['workouts', 'workout_sets'], async () => {
    await run('UPDATE workout_sets SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE workout_id = ?', [at, at, id]);
    await run('UPDATE workouts SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [at, at, id]);
  });
}

/** Workout sets grouped per exercise, in order. */
export function groupSets(sets: WorkoutSet[]) {
  const groups: { exerciseId: string; exerciseOrder: number; sets: WorkoutSet[] }[] = [];
  for (const s of sets) {
    const g = groups.find((x) => x.exerciseOrder === s.exerciseOrder);
    if (g) g.sets.push(s);
    else groups.push({ exerciseId: s.exerciseId, exerciseOrder: s.exerciseOrder, sets: [s] });
  }
  return groups;
}
