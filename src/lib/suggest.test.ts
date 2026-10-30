import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maxGramsFor, suggest, type Suggestion } from './suggest.ts';

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
});
