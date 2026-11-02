// Pure helpers for the History calendar. No imports, so node:test can run them directly.

type Macros = { kcal: number; protein: number; carbs: number; fat: number };

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date "YYYY-MM-DD" of a Date. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Weeks (Monday first) of a month; days outside it are null. `month` is 0-based. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array((first.getDay() + 6) % 7).fill(null);
  for (let d = 1; d <= days; d++) cells.push(ymd(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Within ±10% of the calorie target counts as on target. */
export function dayStatus(kcal: number, target: number): 'under' | 'on' | 'over' {
  if (kcal > target * 1.1) return 'over';
  return kcal < target * 0.9 ? 'under' : 'on';
}

export const proteinHit = (protein: number, target: number) => protein >= target * 0.9;

/** Averages over days that have any food logged, against each day's own target. */
export function monthStats(days: Map<string, Macros>, targetOn: (date: string) => Macros) {
  const list = [...days].filter(([, m]) => m.kcal > 0);
  const n = list.length;
  const avg = (pick: (date: string, m: Macros) => number) => (n ? list.reduce((s, [d, m]) => s + pick(d, m), 0) / n : 0);
  const avgOf = (f: (date: string, m: Macros) => Macros) => ({
    kcal: avg((d, m) => f(d, m).kcal), protein: avg((d, m) => f(d, m).protein),
    carbs: avg((d, m) => f(d, m).carbs), fat: avg((d, m) => f(d, m).fat),
  });
  return {
    logged: n,
    avg: avgOf((_, m) => m),
    avgTarget: avgOf((d) => targetOn(d)),
    onTarget: list.filter(([d, m]) => dayStatus(m.kcal, targetOn(d).kcal) === 'on').length,
    proteinHit: list.filter(([d, m]) => proteinHit(m.protein, targetOn(d).protein)).length,
  };
}

/** Shifts a "YYYY-MM-DD" date by whole days. */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + days));
}

/** The 7 dates (Monday first) of the week containing `date`. */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number);
  const monday = addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Consecutive days with food logged, ending today (or yesterday, so an unlogged morning doesn't reset it). */
export function streak(logged: (date: string) => boolean, today: string) {
  let day = logged(today) ? today : addDays(today, -1);
  let n = 0;
  while (logged(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
