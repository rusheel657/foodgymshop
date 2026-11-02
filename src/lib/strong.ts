// Strong app CSV export (Settings → Export Strong data) → workouts. Pure functions: node:test can load this file.
// Columns (comma or semicolon separated): Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps,
// Distance, Seconds, Notes, Workout Notes, RPE. Set Order is a number, or W (warm-up), D (drop set), F (failure).

export type StrongSet = { weightKg: number | null; reps: number | null; isWarmup: boolean };
export type StrongExercise = { name: string; sets: StrongSet[] };
export type StrongWorkout = { name: string; startedAt: string; minutes: number; exercises: StrongExercise[] };

const LB = 0.45359237;

/** RFC 4180-ish: quoted fields may hold the delimiter, newlines and "" for a quote. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field), (field = '');
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** "1h 5m", "45m", "50s", "1h" → minutes. */
export function parseDuration(s: string) {
  const part = (u: string) => Number(s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${u}`))?.[1] ?? 0);
  const m = part('h') * 60 + part('m') + part('s') / 60;
  return m || Number(s) / 60 || 0; // some exports give plain seconds
}

/** "2024-05-01 18:30:12" (local time) → ISO. */
const toIso = (s: string) => new Date(s.trim().replace(' ', 'T')).toISOString();

/** The weight unit, when the header says so ("Weight (kg)", "Weight (lbs)"); null if it doesn't. */
export function headerUnit(header: string[]): 'kg' | 'lb' | null {
  const w = header.find((h) => /^weight/i.test(h.trim())) ?? '';
  return /\bkg\b/i.test(w) ? 'kg' : /\blbs?\b/i.test(w) ? 'lb' : null;
}

/** Strong CSV → workouts oldest first. `unit`: what the Weight column is in. Cardio-only rows (no weight, no reps) are skipped. */
export function parseStrong(text: string, unit: 'kg' | 'lb'): StrongWorkout[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) return [];
  const col = (name: RegExp) => header.findIndex((h) => name.test(h.trim()));
  const c = {
    date: col(/^date$/i), workout: col(/^workout name$/i), duration: col(/^duration/i), exercise: col(/^exercise name$/i),
    order: col(/^set order$/i), weight: col(/^weight/i), reps: col(/^reps$/i),
  };
  if (c.date < 0 || c.exercise < 0 || c.reps < 0) throw new Error("This doesn't look like a Strong export (no Date, Exercise Name or Reps column).");
  const factor = (headerUnit(header) ?? unit) === 'lb' ? LB : 1;
  const byKey = new Map<string, StrongWorkout>();
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const date = get(c.date);
    if (!date || Number.isNaN(Date.parse(date.replace(' ', 'T')))) continue;
    const rawW = parseFloat(get(c.weight).replace(',', '.'));
    const rawR = parseFloat(get(c.reps));
    const weightKg = Number.isFinite(rawW) && rawW > 0 ? Math.round(rawW * factor * 100) / 100 : null;
    const reps = Number.isFinite(rawR) && rawR > 0 ? Math.round(rawR) : null;
    if (weightKg === null && reps === null) continue;
    const name = get(c.workout) || 'Workout';
    const key = `${date}|${name}`;
    let w = byKey.get(key);
    if (!w) byKey.set(key, (w = { name, startedAt: toIso(date), minutes: parseDuration(get(c.duration)), exercises: [] }));
    const exName = get(c.exercise) || 'Exercise';
    let ex = w.exercises.find((e) => e.name === exName);
    if (!ex) w.exercises.push((ex = { name: exName, sets: [] }));
    ex.sets.push({ weightKg, reps, isWarmup: /^w/i.test(get(c.order)) });
  }
  return [...byKey.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// Lower case, no punctuation, no plural s, no "- medium grip" style suffix: "Seated Cable Rows" ≈ "Seated Cable Row".
const norm = (s: string) =>
  s.toLowerCase().replace(/ - medium grip$/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w) => w.replace(/(?<=..)s$/, '')).join(' ');

/** Strong names put equipment in brackets ("Bench Press (Barbell)"); the exercise list puts it first ("Barbell Bench Press").
 *  Last resort: the name without its equipment ("Romanian Deadlift (Barbell)" → "Romanian Deadlift"). */
export function matchExercise<T extends { name: string }>(strongName: string, list: T[]): T | null {
  const m = strongName.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const tries = m ? [strongName, `${m[2]} ${m[1]}`, `${m[1]} ${m[2]}`, m[1]] : [strongName];
  for (const t of tries) {
    const hit = list.find((e) => norm(e.name) === norm(t));
    if (hit) return hit;
  }
  return null;
}

/** "(Barbell)" → "barbell", for exercises created from Strong names. */
export const equipmentOf = (strongName: string) => strongName.match(/\(([^)]*)\)\s*$/)?.[1].toLowerCase() ?? 'other';
