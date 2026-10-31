import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maxGramsFor, mealTarget, planError, suggest, suggestOptions, type Suggestion } from './suggest.ts';

const f = (id: string, name: string, kcal: number, protein: number, carbs: number, fat: number, maxGrams = 300) =>
  ({ id, name, kcal, protein, carbs, fat, maxGrams });

// Per 100 g, as in the user's My Diet.
const chicken = f('chicken', "Chicken Breast Fillets (Sainsbury's)", 106, 24, 0, 1.1);
const bread = f('bread', "Jason's Sourdough", 230, 10.7, 44.1, 0.8);
const honey = f('honey', 'Rowse Organic Honey', 329, 0.5, 81.5, 0.5, 50);
const lamb = f('lamb', '20% Fat Lamb Mince', 269, 21.5, 0.5, 20);
const butter = f('butter', 'Raw Farm Raw Butter', 717, 0.9, 0.1, 81, 50);

const total = (s: Suggestion[], foods: typeof chicken[]) =>
  s.reduce(
    (t, x) => {
      const food = foods.find((y) => y.id === x.foodId)!;
      return { p: t.p + (food.protein * x.grams) / 100, c: t.c + (food.carbs * x.grams) / 100, fat: t.fat + (food.fat * x.grams) / 100 };
    },
    { p: 0, c: 0, fat: 0 },
  );

test('fills remaining macros closely with a few foods, grams in 5 g steps', () => {
  const foods = [chicken, bread, honey, lamb];
  const s = suggest({ kcal: 900, protein: 70, carbs: 80, fat: 15 }, foods, null);
  assert.ok(s.length >= 2 && s.length <= 4, JSON.stringify(s));
  assert.ok(s.every((x) => x.grams % 5 === 0 && x.grams > 0));
  const t = total(s, foods);
  assert.ok(Math.abs(t.p - 70) < 6 && Math.abs(t.c - 80) < 8 && Math.abs(t.fat - 15) < 4, JSON.stringify({ s, t }));
});

test('chicken brings its cooking butter (5 g per 100 g), and the butter counts towards fat', () => {
  const foods = [chicken, bread];
  const s = suggest({ kcal: 400, protein: 48, carbs: 0, fat: 12 }, foods, butter);
  const c = s.find((x) => x.foodId === 'chicken')!;
  const b = s.find((x) => x.foodId === 'butter')!;
  assert.ok(c && b, JSON.stringify(s));
  assert.equal(b.grams, Math.round(c.grams * 0.05));
  assert.ok(Math.abs(c.grams - 190) <= 15, JSON.stringify(s)); // ~46 g protein from chicken, rest of fat from butter
});

test('respects caps and returns nothing when targets are already hit', () => {
  const s = suggest({ kcal: 2000, protein: 0, carbs: 400, fat: 0 }, [honey], null);
  assert.deepEqual(s, [{ foodId: 'honey', name: 'Rowse Organic Honey', grams: 50 }]);
  assert.deepEqual(suggest({ kcal: -100, protein: -5, carbs: 0, fat: 0 }, [chicken, bread], butter), []);
});

test('caps: twice the usual portion, else 300 g, 50 g for dense foods, never more than at home', () => {
  assert.equal(maxGramsFor(106, 200), 400);
  assert.equal(maxGramsFor(106), 300);
  assert.equal(maxGramsFor(580), 50);
  assert.equal(maxGramsFor(329), 50); // honey
  assert.equal(maxGramsFor(230), 300); // bread
  assert.equal(maxGramsFor(106, undefined, 180), 180); // only 180 g chicken left at home
  assert.equal(maxGramsFor(106, 200, 1000), 400);
  assert.equal(maxGramsFor(106, undefined, 0), 0);
  assert.equal(maxGramsFor(329, undefined, null, null, 80), 80); // honey with an 80 g smallest portion
  assert.equal(maxGramsFor(329, undefined, 60, null, 80), 60); // …but never more than is at home
});

test('options: several different food combinations, closest first, using a variety of foods', () => {
  const eggs = f('eggs', 'Free Range Eggs', 143, 14.1, 0.5, 9.6);
  const juice = f('juice', 'Orange Juice', 41, 0.8, 9.3, 0);
  const foods = [chicken, bread, honey, lamb, eggs, juice];
  const remaining = { kcal: 1200, protein: 90, carbs: 110, fat: 35 };
  const opts = suggestOptions(remaining, foods, butter);
  assert.equal(suggestOptions(remaining, foods, butter, 3).length, 3);
  assert.ok(opts.length >= 6 && opts.length <= 10, `${opts.length} options`);
  assert.ok(opts.some((o) => JSON.stringify(o) === JSON.stringify(suggest(remaining, foods, butter))));
  const keys = opts.map((o) => o.map((x) => x.foodId).sort().join());
  assert.equal(new Set(keys).size, keys.length); // all different
  const errs = opts.map((o) => planError(remaining, o, [...foods, butter]));
  assert.equal(errs[0], Math.min(...errs)); // closest first
  const main = new Set(opts.flat().map((x) => x.foodId));
  assert.ok(main.size >= 5, `options should use a variety of foods: ${[...main]}`);
  assert.deepEqual(suggestOptions({ kcal: 0, protein: 0, carbs: 0, fat: 0 }, foods, butter), []);
});

test('daily limits and counted foods: limit minus what was eaten caps a food; eggs come in whole pieces', () => {
  assert.equal(maxGramsFor(106, undefined, null, 400 - 250), 150); // 400 g/day chicken limit, 250 g already eaten
  assert.equal(maxGramsFor(106, undefined, null, -20), 0); // already over the limit
  const eggs = { ...f('eggs', 'Free Range Eggs', 143, 14.1, 0.5, 9.6), pieceGrams: 50 };
  const s = suggest({ kcal: 400, protein: 30, carbs: 0, fat: 20 }, [eggs], null);
  assert.equal(s.length, 1);
  assert.equal(s[0].grams % 50, 0);
  const capped = suggest({ kcal: 2000, protein: 120, carbs: 0, fat: 5 }, [{ ...chicken, maxGrams: 150 }], null);
  assert.ok(capped[0].grams <= 150, JSON.stringify(capped));
});

test('pairings: yoghurt only comes with honey, fruit and chocolate; never without them', () => {
  const yog = { ...f('yog', 'Greek yoghurt', 97, 9, 3.9, 5), needs: ['honey', 'berries', 'choc'] };
  const berries = f('berries', 'Blueberries', 57, 0.7, 14.5, 0.3);
  const choc = { ...f('choc', 'Dark chocolate 70%', 580, 9.1, 36, 42, 50), minGrams: 10 };
  const want = { kcal: 600, protein: 25, carbs: 70, fat: 22 };
  const s = suggest(want, [yog, honey, berries, choc], null);
  const ids = s.map((x) => x.foodId);
  assert.ok(ids.includes('yog'), JSON.stringify(s));
  for (const id of ['honey', 'berries', 'choc']) assert.ok(ids.includes(id), `${id} missing: ${JSON.stringify(s)}`);
  assert.ok(s.find((x) => x.foodId === 'choc')!.grams >= 10);
  // No honey at home → no yoghurt at all.
  assert.ok(!suggest(want, [yog, berries, choc], null).some((x) => x.foodId === 'yog'));
  // A pairing rule is one-way: honey can still be suggested alone.
  assert.ok(suggest({ kcal: 300, protein: 0, carbs: 70, fat: 0 }, [yog, honey], null).some((x) => x.foodId === 'honey'));
});

test('smallest portion: a food is either left out or at least its minimum', () => {
  const lambMin = { ...lamb, minGrams: 150 };
  const s = suggest({ kcal: 300, protein: 25, carbs: 0, fat: 15 }, [lambMin, chicken], null);
  for (const x of s.filter((x) => x.foodId === 'lamb')) assert.ok(x.grams >= 150, JSON.stringify(s));
  // Minimum bigger than what's allowed (daily limit left) → the food is skipped.
  assert.ok(!suggest({ kcal: 900, protein: 60, carbs: 0, fat: 50 }, [{ ...lambMin, maxGrams: 100 }], null).length);
});

test('meal sizes: share of the day, capped at what is left, macros in proportion', () => {
  const left = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const m = mealTarget(left, 3000, 'medium'); // 33% of 3000 = 990 kcal
  assert.equal(Math.round(m.kcal), 990);
  assert.equal(Math.round(m.protein), Math.round(150 * 990 / 2000));
  assert.equal(Math.round(mealTarget(left, 3000, 'large').kcal), 1350);
  assert.equal(mealTarget({ ...left, kcal: 400 }, 3000, 'large').kcal, 400); // only 400 left
  assert.equal(mealTarget({ ...left, kcal: -50 }, 3000, 'small').kcal, 0);
});
