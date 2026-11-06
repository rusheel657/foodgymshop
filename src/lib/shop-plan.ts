// The two shopping lists: "Recommended" (restock what you usually eat) and "Cheapest" (lowest-cost way to cover your macros).
// Pure maths, no imports, so node:test can run it directly.

export type Buy = { foodId: string; name: string; grams: number };

const roundUp = (grams: number, pieceGrams: number | null | undefined) => {
  const step = pieceGrams || 5;
  return Math.ceil(grams / step - 1e-9) * step;
};

/** What you usually eat, minus what's at home: each food's average a day over your logged days (up to 4 weeks before today),
 *  for the rest of today (what's left of a usual day) plus `days`. Null with under a week of history.
 *  `history`: logged items before today; `eatenToday`: grams per food so far today. */
export function usualBuy(
  history: { day: string; foodId: string | null; grams: number }[],
  eatenToday: Map<string, number>,
  foods: { id: string; name: string; atHome: boolean; homeGrams: number | null; pieceGrams: number | null }[],
  today: string,
  days: number,
): { buy: Buy[]; historyDays: number } | null {
  if (history.length === 0) return null;
  const first = history.reduce((d, i) => (i.day < d ? i.day : d), today);
  const historyDays = Math.round((Date.parse(`${today}T12:00`) - Date.parse(`${first}T12:00`)) / 86_400_000);
  if (historyDays < 7) return null;
  const total = new Map<string, number>();
  for (const i of history) if (i.foodId) total.set(i.foodId, (total.get(i.foodId) ?? 0) + i.grams);
  const buy: (Buy & { daily: number })[] = [];
  for (const f of foods) {
    const daily = (total.get(f.id) ?? 0) / historyDays;
    if (daily <= 0) continue;
    const need = Math.max(0, daily - (eatenToday.get(f.id) ?? 0)) + daily * days;
    const have = f.atHome ? (f.homeGrams ?? Infinity) : 0; // "any amount" at home never needs buying
    const extra = need - have;
    if (extra < daily / 2) continue; // under half a usual day short: not worth a trip
    buy.push({ foodId: f.id, name: f.name, grams: roundUp(extra, f.pieceGrams), daily });
  }
  buy.sort((a, b) => b.daily - a.daily);
  return { buy: buy.map(({ daily: _, ...b }) => b), historyDays };
}

export type PricedFood = {
  id: string; name: string; protein: number; carbs: number; fat: number; // per 100 g
  pricePer100: number; maxGrams: number; pieceGrams?: number | null;
};

/** Cheapest grams of each food so protein, carbs and fat each reach `short`, with no food over its `maxGrams`.
 *  A linear programme (simplex, big-M). `feasible` is false when even the most of everything can't cover it;
 *  then `buy` is the closest it gets. */
export function cheapestBuy(short: { protein: number; carbs: number; fat: number }, foods: PricedFood[]): { buy: Buy[]; feasible: boolean } {
  const need = [short.protein, short.carbs, short.fat];
  const n = foods.length;
  if (need.every((b) => b <= 0.5)) return { buy: [], feasible: true };
  if (n === 0) return { buy: [], feasible: false };
  // Variables (x in 100 g units): x[0..n), cap slack t[n..2n), surplus s[2n..2n+3), artificial a[2n+3..2n+6).
  // Rows: 3 macro rows  A·x − s + a = need;  n cap rows  x + t = max.
  const N = 2 * n + 6;
  const M = 1e6;
  const cost = [...foods.map((f) => f.pricePer100), ...Array(n + 3).fill(0), M, M, M];
  const rows: number[][] = [];
  const rhs: number[] = [];
  const basis: number[] = [];
  (['protein', 'carbs', 'fat'] as const).forEach((k, r) => {
    const row = Array(N).fill(0);
    foods.forEach((f, j) => (row[j] = f[k]));
    row[2 * n + r] = -1;
    row[2 * n + 3 + r] = 1;
    rows.push(row);
    rhs.push(Math.max(0, need[r]));
    basis.push(2 * n + 3 + r);
  });
  foods.forEach((f, j) => {
    const row = Array(N).fill(0);
    row[j] = 1;
    row[n + j] = 1;
    rows.push(row);
    rhs.push(Math.max(0, f.maxGrams) / 100);
    basis.push(n + j);
  });

  for (let iter = 0; iter < 2000; iter++) {
    // Reduced cost of each column; Bland's rule (first negative) so it can't cycle.
    let enter = -1;
    for (let c = 0; c < N && enter < 0; c++) {
      if (basis.includes(c)) continue;
      const reduced = cost[c] - rows.reduce((s, row, r) => s + cost[basis[r]] * row[c], 0);
      if (reduced < -1e-9) enter = c;
    }
    if (enter < 0) break;
    let leave = -1;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r][enter] <= 1e-12) continue;
      if (leave < 0 || rhs[r] / rows[r][enter] < rhs[leave] / rows[leave][enter] - 1e-12) leave = r;
    }
    if (leave < 0) break; // unbounded can't happen (every x is capped), but don't loop
    const p = rows[leave][enter];
    rows[leave] = rows[leave].map((v) => v / p);
    rhs[leave] /= p;
    for (let r = 0; r < rows.length; r++) {
      if (r === leave || rows[r][enter] === 0) continue;
      const k = rows[r][enter];
      rows[r] = rows[r].map((v, c) => v - k * rows[leave][c]);
      rhs[r] -= k * rhs[leave];
    }
    basis[leave] = enter;
  }

  const value = (c: number) => {
    const r = basis.indexOf(c);
    return r < 0 ? 0 : Math.max(0, rhs[r]);
  };
  const feasible = [0, 1, 2].every((r) => value(2 * n + 3 + r) < 1e-6);
  const buy = foods
    .map((f, j) => ({ foodId: f.id, name: f.name, grams: roundUp(value(j) * 100, f.pieceGrams) }))
    .filter((b) => b.grams >= 5)
    .sort((a, b) => b.grams - a.grams);
  return { buy, feasible };
}
