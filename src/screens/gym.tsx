import { useEffect, useState } from 'react';

import { Button, EmptyState, Field, ListRow, Meter, NumberInput, num, Page, Screen, SectionHead, TextInput } from '@/components/ui';
import {
  activeWorkout, addExercise, addSet, DEFAULT_REST_S, deleteTemplate, discardWorkout, finishWorkout, getWorkout,
  groupSets, imageUrl, insertWarmups, listExercises, listTemplates, MUSCLES, previousSets, removeExercise, removeSet,
  saveCustomExercise, saveTemplate, startWorkout, updateSet,
  type Exercise, type Template, type TemplateExercise, type Workout, type WorkoutSet,
} from '@/db/gym';
import { useAccount } from '@/lib/account';
import { epley, formatDuration, shape, volume, warmups } from '@/lib/gym';
import { useNav } from '@/lib/nav';
import { addRest, prepareRestNotifications, startRest, stopRest, useRest } from '@/lib/rest-timer';
import { useLive } from '@/lib/use-live';

const WORKOUT_TABLES = ['workouts', 'workout_sets'];
const TEMPLATE_TABLES = ['templates', 'template_exercises', 'template_sets'];

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const nameOf = (exercises: Exercise[], id: string) => exercises.find((e) => e.id === id)?.name ?? 'Unknown exercise';
const barFor = (e?: Exercise) => (e?.equipment === 'barbell' ? 20 : 0);
const kgReps = (s: { weightKg: number | null; reps: number | null }) => `${s.weightKg ?? '–'} kg × ${s.reps ?? '–'}`;

function Thumb({ exercise }: { exercise?: Exercise }) {
  return exercise?.image ? (
    <img className="ex-thumb" src={imageUrl(exercise.image)} alt="" loading="lazy" />
  ) : (
    <span className="ex-thumb" aria-hidden="true" />
  );
}

/** Starts a workout unless one is already running (then resumes it). */
async function begin(userId: string, nav: ReturnType<typeof useNav>, template: Template | null, replace = false) {
  const current = await activeWorkout();
  if (current && !confirm('A workout is already in progress. Resume it?')) return;
  const id = current?.id ?? (await startWorkout(userId, template));
  void prepareRestNotifications();
  (replace ? nav.replace : nav.push)(<WorkoutScreen workoutId={id} />);
}

export function GymScreen() {
  const nav = useNav();
  const { userId } = useAccount();
  const active = useLive(activeWorkout, WORKOUT_TABLES);
  const templates = useLive(listTemplates, TEMPLATE_TABLES);
  const exercises = useLive(listExercises, ['exercises']);
  const now = useNow();
  if (active === undefined || !templates || !exercises) return null;

  return (
    <Screen title="Gym">
      {active ? (
        <div className="card">
          <h2>Workout in progress</h2>
          <p className="muted">{formatDuration(now - Date.parse(active.startedAt))}</p>
          <Button title="Resume" onClick={() => nav.push(<WorkoutScreen workoutId={active.id} />)} />
        </div>
      ) : (
        <Button title="Start empty workout" variant="secondary" onClick={() => begin(userId, nav, null)} />
      )}

      <section className="stack-sm">
        <SectionHead
          title="Templates"
          action="+ New"
          onAction={() => nav.push(<TemplateFormScreen template={{ id: crypto.randomUUID(), name: '', exercises: [] }} isNew />)}
        />
        {templates.length === 0 && <EmptyState text="Make a template for each workout you repeat." />}
        <div className="list">
          {templates.map((t) => (
            <ListRow
              key={t.id}
              title={t.name}
              subtitle={t.exercises.map((e) => nameOf(exercises, e.exerciseId)).join(', ') || 'No exercises'}
              onClick={() => nav.push(<TemplateFormScreen template={t} />)}
            />
          ))}
        </div>
      </section>
    </Screen>
  );
}

// ---- Exercises ----

function ExercisePickerScreen({ onPick }: { onPick: (e: Exercise) => void }) {
  const nav = useNav();
  const exercises = useLive(listExercises, ['exercises']);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  if (!exercises) return null;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = exercises.filter(
    (e) => (!muscle || e.muscle === muscle) && words.every((w) => e.name.toLowerCase().includes(w)),
  );
  return (
    <Page title="Choose exercise">
      <TextInput label="Search exercises" value={query} onChange={setQuery} placeholder="Search, e.g. bench press" />
      <span className="input">
        <select aria-label="Muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">All muscles</option>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </span>
      <Button title="+ New exercise" variant="secondary" onClick={() => nav.push(<NewExerciseScreen onCreated={onPick} />)} />
      {shown.length === 0 && <EmptyState text="No exercises match." />}
      <div className="list">
        {shown.slice(0, 150).map((e) => (
          <button key={e.id} type="button" className="list-row" onClick={() => onPick(e)}>
            <Thumb exercise={e} />
            <span className="grow">
              <span className="list-title">{e.name}</span>
              <span className="small muted">
                {e.muscle} · {e.equipment}
                {e.custom ? ' · yours' : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
      {shown.length > 150 && <p className="small muted center">Showing 150 of {shown.length}. Search to narrow it down.</p>}
    </Page>
  );
}

const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'bands', 'other'];

function NewExerciseScreen({ onCreated }: { onCreated: (e: Exercise) => void }) {
  const nav = useNav();
  const { userId } = useAccount();
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState(MUSCLES[0]);
  const [equipment, setEquipment] = useState('barbell');
  async function save() {
    const e = { name: name.trim(), muscle, equipment };
    const id = await saveCustomExercise(userId, e);
    nav.pop();
    onCreated({ ...e, id, image: null, custom: true });
  }
  return (
    <Page title="New exercise">
      <Field label="Name">
        <TextInput label="Exercise name" value={name} onChange={setName} placeholder="e.g. Hack squat (gym's machine)" />
      </Field>
      <Field label="Main muscle">
        <span className="input">
          <select aria-label="Main muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </span>
      </Field>
      <Field label="Equipment">
        <span className="input">
          <select aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            {EQUIPMENT.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </span>
      </Field>
      <Button title="Save" onClick={save} disabled={!name.trim()} />
    </Page>
  );
}

// ---- Templates ----

type DraftSet = { reps: string; kg: string };
type DraftExercise = { exerciseId: string; rest: string; sets: DraftSet[] };

function TemplateFormScreen({ template, isNew }: { template: Template; isNew?: boolean }) {
  const nav = useNav();
  const { userId } = useAccount();
  const exercises = useLive(listExercises, ['exercises']);
  const [name, setName] = useState(template.name);
  const [items, setItems] = useState<DraftExercise[]>(
    template.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      rest: String(e.restS),
      sets: e.sets.filter((s) => !s.isWarmup).map((s) => ({ reps: String(s.reps ?? ''), kg: String(s.weightKg ?? '') })),
    })),
  );
  if (!exercises) return null;

  const patch = (i: number, p: Partial<DraftExercise>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, by: number) =>
    setItems((l) => {
      const next = [...l];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const optional = (s: string) => (s.trim() === '' ? null : num(s));
  const bad = (v: number | null, max: number) => v !== null && !(v >= 0 && v <= max);
  const invalid = !name.trim()
    ? 'Give the template a name.'
    : items.length === 0
      ? 'Add at least one exercise.'
      : items.some((e) => !(num(e.rest) >= 0 && num(e.rest) <= 900))
        ? 'Rest must be 0–900 seconds.'
        : items.some((e) => e.sets.length === 0)
          ? 'Each exercise needs at least one set.'
          : items.some((e) => e.sets.some((s) => bad(optional(s.kg), 1000) || bad(optional(s.reps), 500)))
            ? 'Check the weights (0–1000 kg) and reps (0–500).'
            : null;

  const toTemplate = (): Template => ({
    id: template.id,
    name: name.trim(),
    exercises: items.map(
      (e): TemplateExercise => ({
        exerciseId: e.exerciseId,
        restS: num(e.rest),
        sets: e.sets.map((s) => ({ reps: optional(s.reps), weightKg: optional(s.kg), isWarmup: false })),
      }),
    ),
  });

  async function save() {
    await saveTemplate(userId, toTemplate());
    nav.pop();
  }

  return (
    <Page title={isNew ? 'New template' : 'Template'}>
      {!isNew && (
        <Button
          title="Start workout"
          disabled={!!invalid}
          onClick={async () => {
            await saveTemplate(userId, toTemplate());
            await begin(userId, nav, toTemplate(), true);
          }}
        />
      )}
      <Field label="Name">
        <TextInput label="Template name" value={name} onChange={setName} placeholder="e.g. Push day" />
      </Field>

      {items.map((e, i) => {
        const ex = exercises.find((x) => x.id === e.exerciseId);
        return (
          <div key={`${e.exerciseId}-${i}`} className="card">
            <div className="ex-head">
              <Thumb exercise={ex} />
              <strong className="grow">{ex?.name ?? 'Unknown exercise'}</strong>
              <button type="button" className="icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="icon-button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" className="icon-button" aria-label={`Remove ${ex?.name}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <div className="set-edit">
              <span className="small muted">Rest</span>
              <NumberInput label="Rest seconds" value={e.rest} onChange={(rest) => patch(i, { rest })} suffix="s" />
            </div>
            {e.sets.map((s, j) => (
              <div key={j} className="set-edit">
                <span className="small muted">Set {j + 1}</span>
                <NumberInput label={`Set ${j + 1} kg`} value={s.kg} onChange={(kg) => patch(i, { sets: e.sets.map((x, k) => (k === j ? { ...x, kg } : x)) })} suffix="kg" />
                <NumberInput label={`Set ${j + 1} reps`} value={s.reps} onChange={(reps) => patch(i, { sets: e.sets.map((x, k) => (k === j ? { ...x, reps } : x)) })} suffix="reps" />
                <button type="button" className="icon-button" aria-label={`Remove set ${j + 1}`} onClick={() => patch(i, { sets: e.sets.filter((_, k) => k !== j) })}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="link left" onClick={() => patch(i, { sets: [...e.sets, e.sets.at(-1) ?? { reps: '8', kg: '' }] })}>
              + Set
            </button>
          </div>
        );
      })}

      <Button
        title="+ Add exercise"
        variant="secondary"
        onClick={() =>
          nav.push(
            <ExercisePickerScreen
              onPick={(ex) => {
                setItems((l) => [...l, { exerciseId: ex.id, rest: String(DEFAULT_REST_S), sets: [{ reps: '8', kg: '' }, { reps: '8', kg: '' }, { reps: '8', kg: '' }] }]);
                nav.pop();
              }}
            />,
          )
        }
      />
      {invalid && <p className="small muted">{invalid}</p>}
      <Button title="Save" onClick={save} disabled={!!invalid} />
      {!isNew && (
        <Button
          title="Delete template"
          variant="secondary"
          onClick={async () => {
            if (!confirm(`Delete ${template.name}?`)) return;
            await deleteTemplate(template.id);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

// ---- Workout ----

export function WorkoutScreen({ workoutId }: { workoutId: string }) {
  const nav = useNav();
  const { userId } = useAccount();
  const w = useLive(() => getWorkout(workoutId), WORKOUT_TABLES, [workoutId]);
  const exercises = useLive(listExercises, ['exercises']);
  const templates = useLive(listTemplates, TEMPLATE_TABLES);
  const ids = [...new Set(w?.sets.map((s) => s.exerciseId) ?? [])];
  const prev = useLive(() => previousSets(ids), ['workouts'], [ids.join()]);
  const now = useNow();
  if (!w || !exercises || !templates || !prev) return null;
  if (w.endedAt) return null; // finished from another screen

  const template = templates.find((t) => t.id === w.templateId) ?? null;
  const restFor = (exerciseId: string) => template?.exercises.find((e) => e.exerciseId === exerciseId)?.restS ?? DEFAULT_REST_S;
  const groups = groupSets(w.sets);

  async function finish() {
    const unticked = w!.sets.filter((s) => !s.completedAt).length;
    if (w!.sets.length - unticked === 0) return alert('Tick at least one set, or discard the workout.');
    if (unticked && !confirm(`${unticked} unticked set${unticked === 1 ? '' : 's'} will be dropped. Finish?`)) return;
    await finishWorkout(w!.id);
    stopRest();
    const done = (await getWorkout(w!.id))!;
    const doneGroups = groupSets(done.sets);
    if (template && shape(template.exercises) !== shape(doneGroups) && confirm(`Update the "${template.name}" template to match this workout?`)) {
      await saveTemplate(userId, {
        ...template,
        exercises: doneGroups.map((g) => ({
          exerciseId: g.exerciseId,
          restS: restFor(g.exerciseId),
          sets: g.sets.filter((s) => !s.isWarmup).map((s) => ({ reps: s.reps, weightKg: s.weightKg, isWarmup: false })),
        })),
      });
    }
    nav.replace(<WorkoutSummaryScreen workout={done} exercises={exercises!} />);
  }

  async function discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return;
    await discardWorkout(w!.id);
    stopRest();
    nav.pop();
  }

  return (
    <Page title={template?.name ?? 'Workout'}>
      <p className="muted workout-clock">{formatDuration(now - Date.parse(w.startedAt))}</p>
      {groups.length === 0 && <EmptyState text="Add your first exercise." />}

      {groups.map((g) => {
        const ex = exercises.find((e) => e.id === g.exerciseId);
        const last = prev.get(g.exerciseId)?.filter((s) => !s.isWarmup) ?? [];
        const firstWork = g.sets.find((s) => !s.isWarmup && s.weightKg);
        let working = 0;
        return (
          <div key={g.exerciseOrder} className="card">
            <div className="ex-head">
              <Thumb exercise={ex} />
              <strong className="grow">{ex?.name ?? 'Unknown exercise'}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${ex?.name}`}
                onClick={() => confirm(`Remove ${ex?.name} from this workout?`) && removeExercise(w.id, g.exerciseOrder)}>
                ×
              </button>
            </div>
            <div className="set-row head small muted">
              <span>Set</span>
              <span>Previous</span>
              <span>kg</span>
              <span>Reps</span>
              <span>✓</span>
            </div>
            {g.sets.map((s) => {
              const p = s.isWarmup ? undefined : last[working];
              const label = s.isWarmup ? 'W' : String(++working);
              return (
                <SetRow key={s.id} set={s} label={label} previous={p ? kgReps(p) : '–'} onTicked={() => startRest(restFor(g.exerciseId))} />
              );
            })}
            <div className="ex-actions">
              <button type="button" className="link left" onClick={() => addSet(userId, w, g.exerciseId, g.exerciseOrder, g.sets.at(-1))}>
                + Set
              </button>
              {g.sets.length > 1 && (
                <button type="button" className="link" onClick={() => removeSet(g.sets.at(-1)!.id)}>
                  − Last set
                </button>
              )}
              {firstWork && !g.sets.some((s) => s.isWarmup) && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    const sets = warmups(firstWork.weightKg!, barFor(ex));
                    if (sets.length === 0) alert('Too light for warm-ups.');
                    else void insertWarmups(userId, w, g.exerciseId, g.exerciseOrder, sets);
                  }}>
                  Warm-ups
                </button>
              )}
            </div>
          </div>
        );
      })}

      <Button
        title="+ Add exercise"
        variant="secondary"
        onClick={() =>
          nav.push(
            <ExercisePickerScreen
              onPick={async (ex) => {
                nav.pop();
                await addExercise(userId, (await getWorkout(w.id))!, ex.id);
              }}
            />,
          )
        }
      />
      <Button title="Finish workout" onClick={finish} />
      <Button title="Discard workout" variant="secondary" onClick={discard} />
      <RestBar />
    </Page>
  );
}

/** One set: Previous | kg | reps | ✓. Tap the set number to toggle warm-up. Inputs save as you type. */
function SetRow({ set, label, previous, onTicked }: { set: WorkoutSet; label: string; previous: string; onTicked: () => void }) {
  const [kg, setKg] = useState(set.weightKg === null ? '' : String(set.weightKg));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  const parse = (s: string, max: number) => {
    const v = s.trim() === '' ? null : num(s);
    return v === null || (v >= 0 && v <= max) ? v : undefined; // undefined = invalid, don't save
  };
  const kgV = parse(kg, 1000);
  const repsV = parse(reps, 500);
  const done = !!set.completedAt;
  return (
    <div className={done ? 'set-row done' : 'set-row'}>
      <button
        type="button"
        className="set-label"
        aria-label={set.isWarmup ? 'Warm-up set, tap to make a working set' : `Set ${label}, tap to make a warm-up`}
        onClick={() => updateSet(set.id, { isWarmup: !set.isWarmup })}>
        {label}
      </button>
      <span className="small muted">{previous}</span>
      <NumberInput
        label={`Set ${label} kg`}
        value={kg}
        onChange={(t) => {
          setKg(t);
          const v = parse(t, 1000);
          if (v !== undefined) void updateSet(set.id, { weightKg: v });
        }}
      />
      <NumberInput
        label={`Set ${label} reps`}
        value={reps}
        onChange={(t) => {
          setReps(t);
          const v = parse(t, 500);
          if (v !== undefined) void updateSet(set.id, { reps: v === null ? null : Math.round(v) });
        }}
      />
      <button
        type="button"
        className="tick"
        aria-pressed={done}
        aria-label={done ? `Untick set ${label}` : `Tick set ${label}`}
        disabled={!done && (kgV === undefined || repsV === undefined || !repsV)}
        onClick={async () => {
          await updateSet(set.id, { completedAt: done ? null : new Date().toISOString() });
          if (!done && !set.isWarmup) onTicked();
        }}>
        ✓
      </button>
    </div>
  );
}

function RestBar() {
  const rest = useRest();
  if (!rest) return null;
  return (
    <div className="rest-bar" role="timer" aria-live="off">
      <Meter value={rest.left} max={rest.total} label="Rest left" className="meter rest-meter" />
      <div className="rest-controls">
        <button type="button" onClick={() => addRest(-15)}>
          −15
        </button>
        <strong>{formatDuration(rest.left * 1000)}</strong>
        <button type="button" onClick={() => addRest(15)}>
          +15
        </button>
        <button type="button" onClick={stopRest}>
          Skip
        </button>
      </div>
    </div>
  );
}

function WorkoutSummaryScreen({ workout, exercises }: { workout: Workout; exercises: Exercise[] }) {
  const nav = useNav();
  const sets = workout.sets.map((s) => ({ ...s, done: !!s.completedAt }));
  const working = sets.filter((s) => !s.isWarmup);
  return (
    <Page title="Workout done">
      <div className="card">
        <div className="row">
          <div>
            <strong>{formatDuration(Date.parse(workout.endedAt!) - Date.parse(workout.startedAt))}</strong>
            <div className="small muted">Time</div>
          </div>
          <div>
            <strong>{Math.round(volume(sets)).toLocaleString()} kg</strong>
            <div className="small muted">Volume</div>
          </div>
          <div>
            <strong>{working.length}</strong>
            <div className="small muted">Sets</div>
          </div>
        </div>
      </div>
      <div className="list">
        {groupSets(workout.sets).map((g) => {
          const work = g.sets.filter((s) => !s.isWarmup && s.weightKg && s.reps);
          const best = work.reduce<WorkoutSet | null>((b, s) => (!b || epley(s.weightKg!, s.reps!) > epley(b.weightKg!, b.reps!) ? s : b), null);
          return (
            <div key={g.exerciseOrder} className="list-row">
              <span>
                <span className="list-title">{nameOf(exercises, g.exerciseId)}</span>
                <span className="small muted">
                  {g.sets.filter((s) => !s.isWarmup).length} sets{best ? ` · best ${kgReps(best)}` : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <Button title="Done" onClick={() => nav.pop()} />
    </Page>
  );
}
