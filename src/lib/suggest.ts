// "What should I eat?": picks a few at-home foods and exact grams to fill the rest of today's macros.
// Pure maths, no imports, so node:test can run it directly.

type Macros = { kcal: number; protein: number; carbs: number; fat: number };
/** `pieceGrams`: counted foods (eggs) are suggested in whole pieces. */
export type SuggestFood = Macros & { id: string; name: string; maxGrams: number; pieceGrams?: number | null };
export type Suggestion = { foodId: string; name: string; grams: number };

/** Chicken and eggs are always cooked in butter: grams of butter per gram of chicken/egg. */
export const BUTTER_PER_GRAM = 0.05;
export const cookedInButter = (name: string) => /chicken|egg/i.test(name);

// Squared error in kcal per macro (P and C are 4 kcal/g, F is 9); protein weighted 1.5× because it matters most.
const W = [(4 * 1.5) ** 2, 4 ** 2, 9 ** 2];
const vec = (m: Macros) => [m.protein / 100, m.carbs / 100, m.fat / 100];

/** Bounded least squares by coordinate descent: grams x[i] in [0, max[i]] so Σ x·v ≈ target. Returns x and the error. */
function solve(vs: number[][], max: number[], target: number[]) {
  const x = vs.map(() => 0);
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < vs.length; i++) {
      let num = 0;
      let den = 0;
      for (let k = 0; k < 3; k++) {
        const others = vs.reduce((s, v, j) => (j === i ? s : s + v[k] * x[j]), 0);
        num += W[k] * vs[i][k] * (target[k] - others);
        den += W[k] * vs[i][k] ** 2;
      }
      x[i] = den > 0 ? Math.min(max[i], Math.max(0, num / den)) : 0;
    }
  }
  const err = [0, 1, 2].reduce((e, k) => e + W[k] * (vs.reduce((s, v, j) => s + v[k] * x[j], 0) - target[k]) ** 2, 0);
  return { x, err };
}

/** Up to `maxFoods` foods (greedy: add whichever lowers the error most), grams rounded to 5 g.
 *  Chicken/egg rows bring their cooking butter along as an extra row when `butter` is given. */
export function suggest(remaining: Macros, foods: SuggestFood[], butter: (Macros & { id: string; name: string }) | null, maxFoods = 4): Suggestion[] {
  const target = [remaining.protein, remaining.carbs, remaining.fat].map((g) => Math.max(0, g));
  const eff = foods.map((f) => {
    const v = vec(f);
    if (!butter || !cookedInButter(f.name)) return v;
    const b = vec(butter);
    return v.map((x, k) => x + BUTTER_PER_GRAM * b[k]);
  });

  let chosen: number[] = [];
  let best = solve([], [], target);
  while (chosen.length < maxFoods) {
    let pick: { i: number; res: ReturnType<typeof solve> } | null = null;
    for (let i = 0; i < foods.length; i++) {
      if (chosen.includes(i)) continue;
      const set = [...chosen, i];
      const res = solve(set.map((j) => eff[j]), set.map((j) => foods[j].maxGrams), target);
      if (!pick || res.err < pick.res.err) pick = { i, res };
    }
    // Stop when another food helps by less than 2%.
    if (!pick || pick.res.err > best.err * 0.98) break;
    chosen = [...chosen, pick.i];
    best = pick.res;
  }

  const out: Suggestion[] = [];
  let butterGrams = 0;
  chosen.forEach((i, n) => {
    const step = foods[i].pieceGrams || 5;
    let grams = Math.round(best.x[n] / step) * step;
    if (grams > foods[i].maxGrams) grams -= step; // rounding must not break a limit
    if (grams <= 0) return;
    out.push({ foodId: foods[i].id, name: foods[i].name, grams });
    if (butter && cookedInButter(foods[i].name)) butterGrams += grams * BUTTER_PER_GRAM;
  });
  if (butter && butterGrams >= 1) {
    const existing = out.find((s) => s.foodId === butter.id);
    if (existing) existing.grams += Math.round(butterGrams);
    else out.push({ foodId: butter.id, name: butter.name, grams: Math.round(butterGrams) });
  }
  return out;
}

/** Cap on how much of one food a suggestion may use: twice your usual portion, else 300 g (50 g for dense foods like
 *  honey, chocolate, butter); never more than you have at home (`homeGrams`) or than is left of your daily limit
 *  (`limitLeft`, already minus what you ate today). null = not limited. */
export function maxGramsFor(kcalPer100: number, usual?: number, homeGrams: number | null = null, limitLeft: number | null = null) {
  const cap = usual ? Math.max(50, usual * 2) : kcalPer100 > 300 ? 50 : 300;
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
