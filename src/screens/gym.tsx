import { useEffect, useState, type ReactNode } from 'react';

import { Button, EmptyState, Field, ListRow, Meter, NumberInput, num, Page, Screen, Segmented, Sheet, TextInput, Tile } from '@/components/ui';
import {
  activeWorkout, addExercise, addSet, DEFAULT_REST_S, deleteTemplate, discardWorkout, finishWorkout, getWorkout,
  groupSets, imageUrl, insertWarmups, listExercises, listTemplates, MUSCLES, previousSets, removeExercise, removeSet,
  importStrong, saveCustomExercise, saveTemplate, startWorkout, updateSet, workoutHistory,
  type Exercise, type Template, type TemplateExercise, type Workout, type WorkoutSet,
} from '@/db/gym';
import { useAccount } from '@/lib/account';
import { epley, formatDuration, shape, volume, warmups } from '@/lib/gym';
import { tap } from '@/lib/haptics';
import { weekOf, ymd } from '@/lib/history';
import { useNav } from '@/lib/nav';
import { addRest, prepareRestNotifications, startRest, stopRest, useRest } from '@/lib/rest-timer';
import { parseStrong, type StrongWorkout } from '@/lib/strong';
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

const ICON = {
  play: 'M8 5.5v13l10.5-6.5z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5.5 2 1.5 3 2.5 3.5 0-3-.5-5.5 0-8z',
};

type GymSheet = 'start' | 'workouts' | 'history';

const hoursMinutes = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export function GymScreen() {
  const nav = useNav();
  const { userId } = useAccount();
  const active = useLive(activeWorkout, WORKOUT_TABLES);
  const templates = useLive(listTemplates, TEMPLATE_TABLES);
  const exercises = useLive(listExercises, ['exercises']);
  const history = useLive(() => workoutHistory(200), WORKOUT_TABLES); // shortcut: the History sheet and its count stop at 200; page it if that's ever too few
  const [sheet, setSheet] = useState<GymSheet | null>(null);
  const now = useNow();
  if (active === undefined || !templates || !exercises || !history) return null;

  const go = (screen: ReactNode) => {
    setSheet(null);
    nav.push(screen);
  };
  const newTemplate = () => go(<TemplateFormScreen template={{ id: crypto.randomUUID(), name: '', exercises: [] }} isNew />);
  const titleOf = (w: Workout) => w.name ?? templates.find((t) => t.id === w.templateId)?.name ?? 'Workout';
  const kgOf = (w: Workout) => Math.round(volume(w.sets.map((s) => ({ ...s, done: !!s.completedAt }))));
  const monday = new Date(`${weekOf(ymd(new Date(now)))[0]}T00:00`).getTime();
  const week = history.filter((w) => Date.parse(w.startedAt) >= monday);
  const weekMs = week.reduce((t, w) => t + Date.parse(w.endedAt!) - Date.parse(w.startedAt), 0);

  return (
    <Screen title="Gym">
      {active && (
        <button type="button" className="gym-live" onClick={() => nav.push(<WorkoutScreen workoutId={active.id} />)}>
          <span>
            <span className="small">Workout in progress</span>
            <strong>{formatDuration(now - Date.parse(active.startedAt))}</strong>
          </span>
          <span className="gym-live-go">Resume</span>
        </button>
      )}

      <div className="tiles">
        <Tile label="Start workout" icon={ICON.play} tone="green" onClick={() => setSheet('start')} />
        <Tile label="My workouts" icon={ICON.list} tone="blue" count={templates.length} onClick={() => setSheet('workouts')} />
        <Tile label="History" icon={ICON.clock} tone="orange" count={history.length} onClick={() => setSheet('history')} />
        <Tile label="New workout" icon={ICON.plus} tone="red" onClick={newTemplate} />
      </div>

      <div className="card gym-week">
        <span className="label">This week</span>
        <div className="gym-week-stats">
          <span><strong>{week.length}</strong><span className="small muted">{week.length === 1 ? 'workout' : 'workouts'}</span></span>
          <span><strong>{hoursMinutes(weekMs)}</strong><span className="small muted">time</span></span>
          <span><strong>{week.reduce((t, w) => t + kgOf(w), 0).toLocaleString()}</strong><span className="small muted">kg lifted</span></span>
        </div>
      </div>

      {sheet === 'start' && (
        <Sheet title="Start workout" onClose={() => setSheet(null)}>
          <div className="list">
            <SheetRow icon={ICON.plus} title="Empty workout" subtitle="Add exercises as you go" onClick={() => { setSheet(null); void begin(userId, nav, null); }} />
            {templates.map((t) => (
              <SheetRow
                key={t.id}
                icon={ICON.play}
                title={t.name}
                subtitle={t.exercises.map((e) => nameOf(exercises, e.exerciseId)).join(', ') || 'No exercises'}
                onClick={() => { setSheet(null); void begin(userId, nav, t); }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'workouts' && (
        <Sheet title="My workouts" onClose={() => setSheet(null)}>
          {templates.length === 0 ? (
            <EmptyState text="Make a workout for each routine you repeat." />
          ) : (
            <div className="list">
              {templates.map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={t.exercises.map((e) => nameOf(exercises, e.exerciseId)).join(', ') || 'No exercises'}
                  onClick={() => go(<TemplateFormScreen template={t} />)}
                />
              ))}
            </div>
          )}
          <Button title="New workout" onClick={newTemplate} />
        </Sheet>
      )}

      {sheet === 'history' && (
        <Sheet title="History" onClose={() => setSheet(null)}>
          {history.length === 0 ? (
            <EmptyState text="Finished workouts show up here." />
          ) : (
            <div className="list">
              {history.map((w) => (
                <ListRow
                  key={w.id}
                  title={titleOf(w)}
                  subtitle={`${new Date(w.startedAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${formatDuration(Date.parse(w.endedAt!) - Date.parse(w.startedAt))} · ${kgOf(w).toLocaleString()} kg`}
                  onClick={() => go(<WorkoutSummaryScreen workout={w} exercises={exercises} title={titleOf(w)} />)}
                />
              ))}
            </div>
          )}
          <Button title="Import from Strong" variant="secondary" onClick={() => go(<ImportStrongScreen />)} />
        </Sheet>
      )}
    </Screen>
  );
}

function SheetRow({ icon, title, subtitle, danger, onClick }: { icon: string; title: string; subtitle?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={danger ? 'list-row danger' : 'list-row'} onClick={onClick}>
      <span className="sheet-row-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d={icon} />
        </svg>
      </span>
      <span className="grow">
        <span className="list-title">{title}</span>
        {subtitle && <span className="small muted">{subtitle}</span>}
      </span>
    </button>
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
  const [menu, setMenu] = useState<number | null>(null); // exerciseOrder whose ⋯ sheet is open
  const [rpeFor, setRpeFor] = useState<string | null>(null); // set id whose RPE sheet is open
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

  const working = w.sets.filter((s) => !s.isWarmup);
  const doneSets = working.filter((s) => s.completedAt).length;
  const kg = Math.round(volume(w.sets.map((s) => ({ ...s, done: !!s.completedAt }))));
  const menuGroup = groups.find((g) => g.exerciseOrder === menu);
  const menuEx = menuGroup && exercises.find((e) => e.id === menuGroup.exerciseId);
  const menuFirstWork = menuGroup?.sets.find((s) => !s.isWarmup && s.weightKg);
  const rpeSet = w.sets.find((s) => s.id === rpeFor);

  return (
    <main className="screen page workout">
      <header className="workout-head">
        <button type="button" className="back" aria-label="Back" onClick={() => nav.pop()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button type="button" className="finish-pill" onClick={finish}>
          Finish
        </button>
      </header>
      <h1>{template?.name ?? 'Workout'}</h1>

      <div className="card workout-stats">
        <span>
          <strong className="workout-clock">{formatDuration(now - Date.parse(w.startedAt))}</strong>
          <span className="small muted">time</span>
        </span>
        <span>
          <strong>
            {doneSets}/{working.length}
          </strong>
          <span className="small muted">sets</span>
        </span>
        <span>
          <strong>{kg.toLocaleString()}</strong>
          <span className="small muted">kg lifted</span>
        </span>
      </div>

      {groups.length === 0 && <EmptyState text="Add your first exercise." />}

      {groups.map((g) => {
        const ex = exercises.find((e) => e.id === g.exerciseId);
        const last = prev.get(g.exerciseId)?.filter((s) => !s.isWarmup) ?? [];
        const work = g.sets.filter((s) => !s.isWarmup);
        let n = 0;
        return (
          <div key={g.exerciseOrder} className="card ex-card">
            <div className="ex-head">
              <Thumb exercise={ex} />
              <span className="grow">
                <strong className="ex-name">{ex?.name ?? 'Unknown exercise'}</strong>
                <span className="small muted">
                  {work.filter((s) => s.completedAt).length}/{work.length} sets done
                </span>
              </span>
              <button type="button" className="icon-button ex-more" aria-label={`More for ${ex?.name}`} onClick={() => setMenu(g.exerciseOrder)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h.01M12 12h.01M19 12h.01" />
                </svg>
              </button>
            </div>
            <div className="set-row head">
              <span>Set</span>
              <span>Previous</span>
              <span>kg</span>
              <span>Reps</span>
              <span>RPE</span>
              <span />
            </div>
            {g.sets.map((s) => {
              const p = s.isWarmup ? undefined : last[n];
              const label = s.isWarmup ? 'W' : String(++n);
              return (
                <SetRow key={s.id} set={s} label={label} previous={p ? `${p.weightKg ?? '–'} × ${p.reps ?? '–'}` : '–'} onTicked={() => startRest(restFor(g.exerciseId))} onRpe={() => setRpeFor(s.id)} />
              );
            })}
            <button type="button" className="ex-add-set" onClick={() => addSet(userId, w, g.exerciseId, g.exerciseOrder, g.sets.at(-1))}>
              + Add set
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="add-exercise"
        onClick={() =>
          nav.push(
            <ExercisePickerScreen
              onPick={async (ex) => {
                nav.pop();
                await addExercise(userId, (await getWorkout(w.id))!, ex.id);
              }}
            />,
          )
        }>
        + Add exercise
      </button>
      <button type="button" className="link danger" onClick={discard}>
        Discard workout
      </button>

      {menuGroup && (
        <Sheet title={menuEx?.name ?? 'Exercise'} onClose={() => setMenu(null)}>
          <div className="list">
            {menuFirstWork && !menuGroup.sets.some((s) => s.isWarmup) && (
              <SheetRow
                icon={ICON.flame}
                title="Add warm-up sets"
                subtitle="50%, 70% and 85% of your first set"
                onClick={() => {
                  setMenu(null);
                  const sets = warmups(menuFirstWork.weightKg!, barFor(menuEx));
                  if (sets.length === 0) alert('Too light for warm-ups.');
                  else void insertWarmups(userId, w, menuGroup.exerciseId, menuGroup.exerciseOrder, sets);
                }}
              />
            )}
            {menuGroup.sets.length > 1 && (
              <SheetRow
                icon={ICON.minus}
                title="Remove last set"
                onClick={() => {
                  setMenu(null);
                  void removeSet(menuGroup.sets.at(-1)!.id);
                }}
              />
            )}
            <SheetRow
              icon={ICON.trash}
              title="Remove exercise"
              danger
              onClick={() => {
                setMenu(null);
                if (confirm(`Remove ${menuEx?.name} from this workout?`)) void removeExercise(w.id, menuGroup.exerciseOrder);
              }}
            />
          </div>
        </Sheet>
      )}
      {rpeSet && <RpeSheet set={rpeSet} onClose={() => setRpeFor(null)} />}
      <RestBar />
    </main>
  );
}

const RPE_MEANS: Record<string, string> = {
  '6': 'Easy: 4 or more reps left',
  '6.5': '3 to 4 reps left',
  '7': '3 reps left',
  '7.5': '2 to 3 reps left',
  '8': '2 reps left',
  '8.5': '1 to 2 reps left',
  '9': '1 rep left',
  '9.5': 'No reps left, but a little more weight',
  '10': 'Max effort: nothing left',
};

/** Hevy-style RPE picker: a slider from 6 to 10 in half steps, saved as you slide. */
function RpeSheet({ set, onClose }: { set: WorkoutSet; onClose: () => void }) {
  const [rpe, setRpe] = useState(set.rpe ?? 8);
  const save = (v: number | null) => void updateSet(set.id, { rpe: v });
  return (
    <Sheet title="How hard was it?" onClose={onClose}>
      <div className="rpe-value">
        <strong>{set.rpe === null ? '–' : rpe}</strong>
        <span className="muted">{set.rpe === null ? 'Slide to rate this set' : RPE_MEANS[String(rpe)]}</span>
      </div>
      <input
        className="rpe-slider"
        type="range"
        min={6}
        max={10}
        step={0.5}
        value={rpe}
        aria-label="RPE"
        aria-valuetext={`RPE ${rpe}: ${RPE_MEANS[String(rpe)]}`}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v !== rpe) tap();
          setRpe(v);
          save(v);
        }}
      />
      <div className="rpe-scale small muted" aria-hidden="true">
        {[6, 7, 8, 9, 10].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="row">
        <Button title="Clear" variant="secondary" onClick={() => { save(null); onClose(); }} />
        <Button title="Done" onClick={() => { if (set.rpe === null) save(rpe); onClose(); }} />
      </div>
    </Sheet>
  );
}

/** One set: Previous | kg | reps | ✓. Tap the set number to toggle warm-up. Inputs save as you type. */
function SetRow({ set, label, previous, onTicked, onRpe }: { set: WorkoutSet; label: string; previous: string; onTicked: () => void; onRpe: () => void }) {
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
      <button type="button" className={set.rpe === null ? 'rpe-pill' : 'rpe-pill set'} aria-label={`Set ${label} RPE${set.rpe === null ? '' : ` ${set.rpe}`}`} onClick={onRpe}>
        {set.rpe ?? 'RPE'}
      </button>
      <button
        type="button"
        className="tick"
        aria-pressed={done}
        aria-label={done ? `Untick set ${label}` : `Tick set ${label}`}
        disabled={!done && (kgV === undefined || repsV === undefined || !repsV)}
        onClick={async () => {
          tap();
          await updateSet(set.id, { completedAt: done ? null : new Date().toISOString() });
          if (!done && !set.isWarmup) onTicked();
        }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
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
        <span className="rest-time">
          <span className="small muted">Rest</span>
          <strong>{formatDuration(rest.left * 1000)}</strong>
        </span>
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

/** ' · RPE 8–9' (or ' · RPE 8') over the working sets that have one. */
function rpeText(sets: WorkoutSet[]) {
  const r = sets.filter((s) => !s.isWarmup && s.rpe !== null).map((s) => s.rpe!);
  if (r.length === 0) return '';
  const [lo, hi] = [Math.min(...r), Math.max(...r)];
  return ` · RPE ${lo === hi ? lo : `${lo}–${hi}`}`;
}

function WorkoutSummaryScreen({ workout, exercises, title = 'Workout done' }: { workout: Workout; exercises: Exercise[]; title?: string }) {
  const nav = useNav();
  const sets = workout.sets.map((s) => ({ ...s, done: !!s.completedAt }));
  const working = sets.filter((s) => !s.isWarmup);
  return (
    <Page title={title}>
      <div className="card workout-stats">
        <span>
          <strong className="workout-clock">{formatDuration(Date.parse(workout.endedAt!) - Date.parse(workout.startedAt))}</strong>
          <span className="small muted">time</span>
        </span>
        <span>
          <strong>{working.length}</strong>
          <span className="small muted">sets</span>
        </span>
        <span>
          <strong>{Math.round(volume(sets)).toLocaleString()}</strong>
          <span className="small muted">kg lifted</span>
        </span>
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
                  {rpeText(g.sets)}
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

// ---- Import from Strong ----

/** Strong's CSV export → history + templates (see importStrong). */
function ImportStrongScreen() {
  const nav = useNav();
  const { userId } = useAccount();
  const [text, setText] = useState<string | null>(null);
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Awaited<ReturnType<typeof importStrong>> | null>(null);
  let parsed: StrongWorkout[] | null = null;
  let parseError: string | null = null;
  try {
    parsed = text === null ? null : parseStrong(text, unit);
  } catch (e) {
    parseError = (e as Error).message;
  }
  const sets = parsed?.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0) ?? 0;
  const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

  async function run() {
    setBusy(true);
    try {
      setDone(await importStrong(userId, parsed!));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Page title="Imported">
        <div className="card stack-sm">
          <strong>{done.workouts.toLocaleString()} workouts · {done.sets.toLocaleString()} sets</strong>
          <p className="small muted">
            {done.templates} new templates (one per workout name, from its latest session) · {done.exercises} exercises added under Strong's names
            {done.skipped ? ` · ${done.skipped} already imported, skipped` : ''}
          </p>
        </div>
        <Button title="Done" onClick={() => nav.pop()} />
      </Page>
    );
  }

  return (
    <Page title="Import from Strong">
      <div className="card stack-sm">
        <p className="small">
          In Strong, open <b>Settings → Export Strong Data</b> (or Profile → Settings → Export data) and save the CSV to your phone. Then pick it
          here.
        </p>
        <p className="small muted">
          Strong's export has your workout history, but not your templates. A template is rebuilt for each workout name (e.g. "Push A") from
          the last time you did it. Exercises are matched to this app's list where the name fits; the rest are added under Strong's names.
        </p>
      </div>
      <label className="button secondary file-button">
        {text === null ? 'Choose the CSV file' : 'Choose a different file'}
        <input
          type="file"
          accept=".csv,text/csv,text/comma-separated-values,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </label>
      {text !== null && (
        <Field label="Weights in the file are in" hint="As set in Strong. Ignored if the file says (kg or lbs in its header).">
          <Segmented options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }] as const} value={unit} onChange={setUnit} />
        </Field>
      )}
      {(parseError || error) && <p className="small danger">{parseError ?? error}</p>}
      {parsed && parsed.length === 0 && <p className="small muted">No strength sets found in this file.</p>}
      {parsed && parsed.length > 0 && (
        <>
          <div className="card stack-sm">
            <strong>{parsed.length.toLocaleString()} workouts · {sets.toLocaleString()} sets</strong>
            <p className="small muted">
              {day(parsed[0].startedAt)} – {day(parsed.at(-1)!.startedAt)} · {new Set(parsed.map((w) => w.name)).size} workout names ·{' '}
              {new Set(parsed.flatMap((w) => w.exercises.map((e) => e.name))).size} exercises
            </p>
          </div>
          <Button title="Import" onClick={run} busy={busy} />
        </>
      )}
    </Page>
  );
}
