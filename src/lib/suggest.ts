// "What should I eat?": picks a few at-home foods and exact grams to fill the rest of today's macros.
// Pure maths, no imports, so node:test can run it directly.

type Macros = { kcal: number; protein: number; carbs: number; fat: number };
/** `pieceGrams`: counted foods (eggs) are suggested in whole pieces. `minGrams`: smallest portion worth eating.
 *  `needs`: ids of foods this one is only eaten with (yoghurt → honey, fruit, chocolate). */
export type SuggestFood = Macros & {
  id: string; name: string; maxGrams: number; pieceGrams?: number | null; minGrams?: number | null; needs?: string[];
};
export type Suggestion = { foodId: string; name: string; grams: number };

/** Chicken and eggs are always cooked in butter: grams of butter per gram of chicken/egg. */
export const BUTTER_PER_GRAM = 0.05;
export const cookedInButter = (name: string) => /chicken|egg/i.test(name);

// Squared error in kcal per macro (P and C are 4 kcal/g, F is 9); protein weighted 1.5× because it matters most.
const W = [(4 * 1.5) ** 2, 4 ** 2, 9 ** 2];
const vec = (m: Macros) => [m.protein / 100, m.carbs / 100, m.fat / 100];

/** Bounded least squares by coordinate descent: grams x[i] in [lo[i], hi[i]] so Σ x·v ≈ target. Returns x and the error. */
function solve(vs: number[][], lo: number[], hi: number[], target: number[]) {
  const x = [...lo];
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < vs.length; i++) {
      let num = 0;
      let den = 0;
      for (let k = 0; k < 3; k++) {
        const others = vs.reduce((s, v, j) => (j === i ? s : s + v[k] * x[j]), 0);
        num += W[k] * vs[i][k] * (target[k] - others);
        den += W[k] * vs[i][k] ** 2;
      }
      x[i] = den > 0 ? Math.min(hi[i], Math.max(lo[i], num / den)) : lo[i];
    }
  }
  const err = [0, 1, 2].reduce((e, k) => e + W[k] * (vs.reduce((s, v, j) => s + v[k] * x[j], 0) - target[k]) ** 2, 0);
  return { x, err };
}

/** Up to `maxFoods` picks (greedy: add whichever lowers the error most), grams rounded to 5 g or whole pieces.
 *  Picking a food also picks the foods it `needs`; it's skipped if one of them isn't available.
 *  Chicken/egg rows bring their cooking butter along as an extra row when `butter` is given. */
export function suggest(remaining: Macros, foods: SuggestFood[], butter: (Macros & { id: string; name: string }) | null, maxFoods = 4): Suggestion[] {
  const target = [remaining.protein, remaining.carbs, remaining.fat].map((g) => Math.max(0, g));
  const eff = foods.map((f) => {
    const v = vec(f);
    if (!butter || !cookedInButter(f.name)) return v;
    const b = vec(butter);
    return v.map((x, k) => x + BUTTER_PER_GRAM * b[k]);
  });
  const index = new Map(foods.map((f, i) => [f.id, i]));
  const step = (i: number) => foods[i].pieceGrams || 5;
  // A food plus everything it must be eaten with (and what those need); null if one isn't available.
  const groupOf = (i: number) => {
    const g = [i];
    for (let k = 0; k < g.length; k++) {
      for (const id of foods[g[k]].needs ?? []) {
        const j = index.get(id);
        if (j === undefined) return null;
        if (!g.includes(j)) g.push(j);
      }
    }
    return g;
  };
  // Lower bounds: the food's smallest portion; a food another one needs must be at least one step (it has to be there).
  const bounds = (set: number[]) => {
    const needed = new Set(set.flatMap((i) => (foods[i].needs ?? []).map((id) => index.get(id))));
    return {
      lo: set.map((i) => Math.max(foods[i].minGrams ?? 0, needed.has(i) ? step(i) : 0)),
      hi: set.map((i) => foods[i].maxGrams),
    };
  };

  let chosen: number[] = [];
  let best = solve([], [], [], target);
  while (chosen.length < maxFoods) {
    let pick: { set: number[]; res: ReturnType<typeof solve> } | null = null;
    for (let i = 0; i < foods.length; i++) {
      if (chosen.includes(i)) continue;
      const group = groupOf(i);
      if (!group) continue;
      const set = [...chosen, ...group.filter((j) => !chosen.includes(j))];
      const { lo, hi } = bounds(set);
      if (lo.some((l, k) => l > hi[k])) continue; // e.g. smallest portion is more than what's left of the daily limit
      const res = solve(set.map((j) => eff[j]), lo, hi, target);
      if (!pick || res.err < pick.res.err) pick = { set, res };
    }
    // Stop when another food helps by less than 2%.
    if (!pick || pick.res.err > best.err * 0.98) break;
    chosen = pick.set;
    best = pick.res;
  }

  const { lo, hi } = bounds(chosen);
  const out: Suggestion[] = [];
  let butterGrams = 0;
  chosen.forEach((i, n) => {
    const s = step(i);
    let grams = Math.round(best.x[n] / s) * s;
    if (grams > hi[n]) grams -= s; // rounding must not break a limit…
    if (grams < lo[n]) grams = Math.ceil(lo[n] / s) * s <= hi[n] ? Math.ceil(lo[n] / s) * s : lo[n]; // …or a minimum
    if (grams <= 0) return;
    out.push({ foodId: foods[i].id, name: foods[i].name, grams });
    if (butter && cookedInButter(foods[i].name)) butterGrams += grams * BUTTER_PER_GRAM;
  });
  if (butter && butterGrams >= 1) {
    // Butter eaten plus cooking butter stays within butter's own cap (largest portion, daily limit, what's at home).
    const cap = foods.find((f) => f.id === butter.id)?.maxGrams ?? Infinity;
    const existing = out.find((s) => s.foodId === butter.id);
    if (existing) existing.grams = Math.min(existing.grams + Math.round(butterGrams), Math.floor(cap));
    else out.push({ foodId: butter.id, name: butter.name, grams: Math.min(Math.round(butterGrams), Math.floor(cap)) });
  }
  return out;
}

/** Cap on how much of one food a suggestion may use: your largest portion (`maxPortion`), else twice your usual
 *  portion, else 300 g (50 g for dense foods like honey, chocolate, butter); never more than you have at home
 *  (`homeGrams`) or than is left of your daily limit (`limitLeft`, already minus what you ate today). null = not limited. */
export function maxGramsFor(
  kcalPer100: number, usual?: number, homeGrams: number | null = null, limitLeft: number | null = null, minGrams: number | null = null,
  maxPortion: number | null = null,
) {
  // Your own smallest portion beats the automatic cap, never the hard limits.
  const cap = Math.max(maxPortion ?? (usual ? Math.max(50, usual * 2) : kcalPer100 > 300 ? 50 : 300), minGrams ?? 0);
  return Math.max(0, Math.min(cap, homeGrams ?? Infinity, limitLeft ?? Infinity));
}

/** How far a plan's totals are from the target (same weighting as the solver; lower is better). */
export function planError(remaining: Macros, plan: Suggestion[], foods: (Macros & { id: string })[]) {
  const total = [0, 0, 0];
  for (const p of plan) {
    const f = foods.find((x) => x.id === p.foodId);
    if (f) vec(f).forEach((v, k) => (total[k] += v * p.grams));
  }
  const target = [remaining.protein, remaining.carbs, remaining.fat].map((g) => Math.max(0, g));
  return [0, 1, 2].reduce((e, k) => e + W[k] * (total[k] - target[k]) ** 2, 0);
}

/** Up to `count` different combinations: the closest plan first, then re-plans that leave out foods already used,
 *  picked for being close *and* sharing few foods with the options before them (so they're real alternatives). */
export function suggestOptions(
  remaining: Macros,
  foods: SuggestFood[],
  butter: (Macros & { id: string; name: string }) | null,
  count = 10,
): Suggestion[][] {
  const all = butter ? [...foods, butter] : foods;
  const seen = new Set<string>();
  const options: { plan: Suggestion[]; err: number }[] = [];
  const queue: string[][] = [[]]; // food ids to leave out
  for (let tries = 0; queue.length && tries < count * 5; tries++) {
    const without = queue.shift()!;
    const plan = suggest(remaining, foods.filter((f) => !without.includes(f.id)), butter);
    const key = plan.map((p) => p.foodId).sort().join();
    if (!plan.length || seen.has(key)) continue;
    seen.add(key);
    options.push({ plan, err: planError(remaining, plan, all) });
    for (const p of plan) if (p.foodId !== butter?.id) queue.push([...without, p.foodId]);
  }
  const foodsOf = (plan: Suggestion[]) => new Set(plan.filter((p) => p.foodId !== butter?.id).map((p) => p.foodId));
  const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;
  const picked: typeof options = [];
  const rest = options.sort((a, b) => a.err - b.err);
  while (picked.length < count && rest.length) {
    // +50 so near-perfect plans still compare on variety; ×(1 + 3·overlap) penalises repeating the same foods.
    const score = (o: (typeof options)[number]) =>
      (o.err + 50) * (1 + 3 * Math.max(0, ...picked.map((p) => overlap(foodsOf(o.plan), foodsOf(p.plan)))));
    rest.sort((a, b) => score(a) - score(b));
    picked.push(rest.shift()!);
  }
  return picked.map((o) => o.plan);
}

/** Meal sizes as a share of the day's calories. */
/** The day's meals: when each ends (hour, 24 h clock), a usual time to eat it, and its share of the day's calories. */
export const MEALS = [
  { label: 'Breakfast', until: 11, at: 8, share: 0.25 },
  { label: 'Lunch', until: 15, at: 13, share: 0.3 },
  { label: 'Snacks', until: 18, at: 16, share: 0.15 },
  { label: 'Dinner', until: 24, at: 19, share: 0.3 },
] as const;

/** Which foods you eat at which meal, from logged items' hours: a food fits a meal once you've had it there twice.
 *  Meals with under 5 logged items don't filter at all (not enough to go on). */
export function mealFits(history: { hour: number; foodId: string | null }[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const i of history) {
    const meal = MEALS.find((m) => i.hour < m.until)!.label;
    if (!i.foodId) continue;
    const c = counts.get(meal) ?? new Map<string, number>();
    c.set(i.foodId, (c.get(i.foodId) ?? 0) + 1);
    counts.set(meal, c);
  }
  return (foodId: string, meal: string) => {
    const c = counts.get(meal);
    if (!c || [...c.values()].reduce((a, b) => a + b, 0) < 5) return true;
    return (c.get(foodId) ?? 0) >= 2;
  };
}

/** A plan for the rest of the day: one meal per meal time still to come (from `hour`), splitting `remaining` by their shares.
 *  `maxGrams` caps one portion; `dayGrams` is what the whole day may use (at home, daily limit), shared across meals.
 *  Foods used in an earlier meal are left out of later ones unless that makes the meal clearly worse (variety). */
export function dayPlan(
  remaining: Macros,
  foods: (SuggestFood & { dayGrams: number })[],
  butter: (Macros & { id: string; name: string }) | null,
  hour: number,
  fits: (foodId: string, meal: string) => boolean = () => true,
): { label: string; at: number; plan: Suggestion[] }[] {
  const meals = MEALS.filter((m) => m.until > hour);
  const total = meals.reduce((t, m) => t + m.share, 0);
  const left = new Map(foods.map((f) => [f.id, f.dayGrams]));
  const used = new Set<string>();
  const all = butter ? [...foods, butter] : foods;
  return meals.map((m) => {
    const k = m.share / total;
    const target = { kcal: remaining.kcal * k, protein: remaining.protein * k, carbs: remaining.carbs * k, fat: remaining.fat * k };
    const capped = foods.map((f) => ({ ...f, maxGrams: Math.max(0, Math.min(f.maxGrams, left.get(f.id) ?? 0)) }));
    const usual = capped.filter((f) => fits(f.id, m.label));
    const pool = usual.length >= 2 ? usual : capped; // too little to go on: any food
    const fresh = suggest(target, pool.filter((f) => !used.has(f.id)), butter);
    const any = suggest(target, pool, butter);
    // A repeat is fine when the fresh plan misses by much more (e.g. only one protein source at home).
    const plan = fresh.length && planError(target, fresh, all) <= planError(target, any, all) * 1.5 + 100 ? fresh : any;
    for (const p of plan) {
      left.set(p.foodId, (left.get(p.foodId) ?? 0) - p.grams);
      if (p.foodId !== butter?.id) used.add(p.foodId);
    }
    return { label: m.label, at: m.at, plan };
  });
}

export const MEAL_SIZES = { small: 0.2, medium: 0.33, large: 0.45 } as const;
export type MealSize = keyof typeof MEAL_SIZES;

/** What one meal of `size` should hold: that share of the day's calories, never more than what's left,
 *  with the macros in the same proportions as what's left. */
export function mealTarget(remaining: Macros, dailyKcal: number, size: MealSize): Macros {
  const left = Math.max(0, remaining.kcal);
  if (left === 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const f = Math.min(left, dailyKcal * MEAL_SIZES[size]) / left;
  const part = (g: number) => Math.max(0, g) * f;
  return { kcal: left * f, protein: part(remaining.protein), carbs: part(remaining.carbs), fat: part(remaining.fat) };
}

/** Total macros of a plan. */
export function planMacros(plan: Suggestion[], foods: (Macros & { id: string })[]): Macros {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const p of plan) {
    const f = foods.find((x) => x.id === p.foodId);
    if (!f) continue;
    for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) t[k] += (f[k] * p.grams) / 100;
  }
  return t;
}

/** Shopping check. `short` is what's missing in total: `required` (rest of today + the next days) minus everything
 *  usable at home (`stock`, maxGrams = what you have within daily limits). Not a meal plan's leftovers: a plan avoids
 *  overshooting fat, so it can leave protein unused even when there's plenty. If a macro is short by more than 10% of
 *  a day, it plans with home stock plus what could be bought (`catalog`, maxGrams = a sensible amount to buy) and
 *  `buy` is what that plan uses beyond what's at home. */
export function planShopping(
  required: Macros,
  daily: Macros,
  stock: SuggestFood[],
  catalog: SuggestFood[],
  butter: (Macros & { id: string; name: string }) | null,
) {
  const fromHome = stock.filter((f) => f.maxGrams > 0).map((f) => ({ foodId: f.id, name: f.name, grams: f.maxGrams }));
  const have = planMacros(fromHome, stock);
  const short = {
    kcal: Math.max(0, required.kcal - have.kcal),
    protein: Math.max(0, required.protein - have.protein),
    carbs: Math.max(0, required.carbs - have.carbs),
    fat: Math.max(0, required.fat - have.fat),
  };
  const needed = short.protein > daily.protein * 0.1 || short.carbs > daily.carbs * 0.1 || short.fat > daily.fat * 0.1;
  if (!needed) return { needed, short, fromHome, buy: [] as Suggestion[] };

  const home = new Map(stock.map((f) => [f.id, f.maxGrams]));
  const full = suggest(required, catalog.map((f) => ({ ...f, maxGrams: (home.get(f.id) ?? 0) + f.maxGrams })), butter, 10);
  const buy = full.flatMap((p) => {
    const f = catalog.find((x) => x.id === p.foodId);
    const extra = p.grams - (home.get(p.foodId) ?? 0);
    // Skip trimmings like 40 g of lamb: not worth buying (under 3% of the calories needed).
    if (!f || extra <= 0 || (f.kcal * extra) / 100 < required.kcal * 0.03) return [];
    const step = f.pieceGrams || 5;
    return [{ ...p, grams: Math.ceil(extra / step) * step }]; // buy whole pieces / round up
  });
  return { needed, short, fromHome, buy };
}
