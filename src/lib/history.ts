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

/** Averages over days that have any food logged. */
export function monthStats(days: Map<string, Macros>, target: Macros) {
  const list = [...days.values()].filter((m) => m.kcal > 0);
  const n = list.length;
  const avg = (k: keyof Macros) => (n ? list.reduce((s, m) => s + m[k], 0) / n : 0);
  return {
    logged: n,
    avg: { kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') },
    onTarget: list.filter((m) => dayStatus(m.kcal, target.kcal) === 'on').length,
    proteinHit: list.filter((m) => proteinHit(m.protein, target.protein)).length,
  };
}
