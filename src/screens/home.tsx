import { useState } from 'react';

import { Button, EmptyState, NumberInput, num, Page } from '@/components/ui';
import { listFoods, setAtHome, setHomeGrams, type Food } from '@/db/diet';
import { usualPortions } from '@/db/log';
import { useNav } from '@/lib/nav';
import { formatMacros, macrosFor, sumMacros, type LogItem, type Macros } from '@/lib/nutrition';
import { maxGramsFor, suggestOptions } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';
import { LogFormScreen, newLog } from '@/screens/log';

const isButter = (f: Food) => /butter/i.test(f.name);

/** Tick the My Diet foods you have in the kitchen right now. */
export function AtHomeScreen() {
  const foods = useLive(listFoods, ['foods']);
  if (!foods) return null;
  return (
    <Page title="At home">
      <p className="muted">Tick what's in your kitchen and how much is left. Suggestions only use these, and never more than you have.</p>
      {foods.length === 0 && <EmptyState text="Add foods in My Diet first." />}
      <div className="list">
        {foods.map((f) => (
          <HomeRow key={f.id} food={f} />
        ))}
      </div>
    </Page>
  );
}

function HomeRow({ food: f }: { food: Food }) {
  const [grams, setGrams] = useState(f.homeGrams === null ? '' : String(f.homeGrams));
  const v = num(grams);
  const invalid = grams.trim() !== '' && !(v >= 0 && v <= 20000);
  return (
    <div className="list-row home-row">
      <label className="check-row">
        <input type="checkbox" checked={f.atHome} onChange={(e) => setAtHome(f.id, e.target.checked)} />
        <span>
          <span className="list-title">{f.name}</span>
          <span className="small muted">{invalid ? 'Enter 0–20000 g' : formatMacros(f) + ' per 100 g'}</span>
        </span>
      </label>
      {f.atHome && (
        <NumberInput
          label={`Grams of ${f.name} at home`}
          value={grams}
          placeholder="any"
          suffix="g"
          onChange={(t) => {
            setGrams(t);
            const n = num(t);
            if (t.trim() === '') void setHomeGrams(f.id, null);
            else if (n >= 0 && n <= 20000) void setHomeGrams(f.id, n);
          }}
        />
      )}
    </div>
  );
}

/** Exact grams of at-home foods that fill the rest of the day's macros. */
export function SuggestScreen({ remaining, loggedAt }: { remaining: Macros; loggedAt: string }) {
  const nav = useNav();
  const data = useLive(async () => ({ foods: await listFoods(), usual: await usualPortions() }), ['foods', 'food_log_items']);
  if (!data) return null;
  const { foods, usual } = data;
  const home = foods.filter((f) => f.atHome && !isButter(f));
  // Chicken and eggs are cooked in butter: use the butter from My Diet (at home first).
  const butter = foods.find((f) => isButter(f) && f.atHome) ?? foods.find(isButter) ?? null;
  const options = suggestOptions(
    remaining,
    home.map((f) => ({ ...f, maxGrams: maxGramsFor(f.kcal, usual.get(f.id), f.homeGrams) })),
    butter,
  ).map((plan) =>
    plan.map((p): LogItem => {
      const f = foods.find((x) => x.id === p.foodId)!;
      return { foodId: f.id, name: f.name, grams: p.grams, verified: true, per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat } };
    }),
  );
  const left = (n: number) => Math.max(0, Math.round(n));

  return (
    <Page title="What to eat">
      <div className="card">
        <span className="label">Left today</span>
        <p>
          {left(remaining.kcal)} kcal · P {left(remaining.protein)} g · C {left(remaining.carbs)} g · F {left(remaining.fat)} g
        </p>
      </div>

      {home.length === 0 ? (
        <EmptyState text="Tick the foods you have at home first." />
      ) : options.length === 0 ? (
        <EmptyState text="You've hit your targets for today." />
      ) : (
        options.map((items, n) => (
          <section key={items.map((i) => i.foodId).join()} className="option">
            <div className="option-head">
              <h2>Option {n + 1}</h2>
              {n === 0 && <span className="chip">Closest match</span>}
            </div>
            {items.map((i) => (
              <div key={i.foodId} className="option-item">
                <strong>{i.grams} g</strong>
                <span>
                  {i.name}
                  <span className="small muted">
                    {formatMacros(macrosFor(i.per100, i.grams))}
                    {butter && i.foodId === butter.id ? ' · for cooking' : ''}
                  </span>
                </span>
              </div>
            ))}
            <p className="option-total small">Adds {formatMacros(sumMacros(items.map((i) => macrosFor(i.per100, i.grams))))}</p>
            <Button
              title="Log this"
              variant={n === 0 ? 'primary' : 'secondary'}
              onClick={() => nav.replace(<LogFormScreen log={newLog(loggedAt, { items })} isNew />)}
            />
          </section>
        ))
      )}
      <Button title="Edit what's at home" variant="secondary" onClick={() => nav.push(<AtHomeScreen />)} />
    </Page>
  );
}
