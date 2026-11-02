import { useEffect, useState } from 'react';

import { Button, EmptyState, NumberInput, num, Page, Segmented } from '@/components/ui';
import { listFoods, listStockChanges, setAtHome, setHomeGrams, type Food, type StockReason } from '@/db/diet';
import { listLogs, usualPortions } from '@/db/log';
import { localDate } from '@/db/profile';
import { addDays, ymd } from '@/lib/history';
import { useTargets } from '@/lib/health';
import { animate } from '@/lib/motion';
import { useNav } from '@/lib/nav';
import { addPhoto, canUseCamera } from '@/lib/photos';
import { amountLabel, formatMacros, lastsFor, macrosFor, showAmount, sumMacros, toGrams, unitOf, type LogItem, type Macros } from '@/lib/nutrition';
import { maxGramsFor, MEAL_SIZES, mealTarget, suggestOptions, type MealSize } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';
import { GroceryScanScreen } from '@/screens/groceries';
import { LogFormScreen, newLog } from '@/screens/log';

const isButter = (f: Food) => /butter/i.test(f.name);

/** Tick the My Diet foods you have in the kitchen right now. */
export function AtHomeScreen() {
  const nav = useNav();
  const all = useLive(() => listFoods(true), ['foods']); // Changes also names foods switched off since
  const [tab, setTab] = useState<'stock' | 'changes'>('stock');
  if (!all) return null;
  const foods = all.filter((f) => !f.disabled);

  async function scan(from: 'camera' | 'gallery') {
    if (!navigator.onLine) return alert('No connection. Add amounts by hand instead.');
    try {
      const uri = await addPhoto(from);
      if (uri) nav.push(<GroceryScanScreen photo={uri} />);
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) alert((e as Error).message);
    }
  }
  return (
    <Page title="At home">
      <Segmented
        options={[{ value: 'stock', label: 'Stock' }, { value: 'changes', label: 'Changes' }] as const}
        value={tab}
        onChange={(t) => animate('fade', () => setTab(t))}
      />
      {tab === 'changes' ? (
        <StockChanges foods={all} />
      ) : (
        <>
          <p className="muted">Tick what's in your kitchen and how much is left. Suggestions only use these, and never more than you have.</p>
          <div className="row">
            {canUseCamera && <Button title="Photo of groceries" onClick={() => scan('camera')} />}
            <Button title={canUseCamera ? 'From gallery' : 'Groceries photo'} variant="secondary" onClick={() => scan('gallery')} />
          </div>
          <StockTotals foods={foods} />
          {foods.length === 0 && <EmptyState text="Add foods in My Diet first." />}
          <div className="list">
            {foods.map((f) => (
              <HomeRow key={f.id} food={f} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

const REASONS: Record<StockReason, string> = {
  eaten: 'Eaten', edited: 'Log edited', returned: 'Log deleted, put back', bought: 'Bought', manual: 'Changed by hand',
};

/** Recent changes to what's at home, newest first, grouped by day. */
function StockChanges({ foods }: { foods: Food[] }) {
  const changes = useLive(() => listStockChanges(), ['stock_changes']);
  if (!changes) return null;
  if (changes.length === 0) return <EmptyState text="No changes yet. Eating, buying and editing amounts will show up here." />;
  const today = localDate();
  const dayOf = (iso: string) => localDate(new Date(iso));
  const label = (d: string) =>
    d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
  const days = [...new Set(changes.map((c) => dayOf(c.at)))];
  return (
    <>
      {days.map((d) => (
        <section key={d} className="stack-sm">
          <h2 className="change-day">{label(d)}</h2>
          <div className="list">
            {changes
              .filter((c) => dayOf(c.at) === d)
              .map((c) => {
                const f = foods.find((x) => x.id === c.foodId);
                const piece = f?.pieceGrams;
                const show = (g: number | null) => (g === null ? 'any' : amountLabel(g, piece));
                const delta = c.before !== null && c.after !== null ? c.after - c.before : null;
                const kind = delta === null ? 'set' : delta < 0 ? 'down' : 'up';
                return (
                  <div key={c.id} className={`change-row ${kind}`}>
                    <span className="change-icon" aria-hidden="true">
                      {kind === 'down' ? '−' : kind === 'up' ? '+' : '='}
                    </span>
                    <span className="grow">
                      <span className="list-title">{f?.name ?? 'Deleted food'}</span>
                      <span className="small muted">
                        {REASONS[c.reason]} · {new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="change-amount">
                      <strong>{delta === null ? show(c.after) : `${delta > 0 ? '+' : '−'}${amountLabel(Math.abs(delta), piece)}`}</strong>
                      <span className="small muted">
                        {show(c.before)} → {show(c.after)}
                      </span>
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}

const STOCK_MACROS = [
  { key: 'protein', label: 'protein' },
  { key: 'carbs', label: 'carbs' },
  { key: 'fat', label: 'fat' },
] as const;

/** What's in the kitchen in total and how long it lasts at your daily targets; tap a macro for its sources.
 *  Foods set to "any" have no amount to add up. */
function StockTotals({ foods }: { foods: Food[] }) {
  const today = localDate();
  const target = useTargets([today])?.get(today);
  const [open, setOpen] = useState<(typeof STOCK_MACROS)[number]['key'] | null>(null);
  const counted = foods.filter((f) => f.atHome && f.homeGrams !== null);
  const anyCount = foods.filter((f) => f.atHome && f.homeGrams === null).length;
  const t = sumMacros(counted.map((f) => macrosFor(f, f.homeGrams!)));
  // The macro that runs out first sets how long the kitchen lasts.
  const first = target && [...STOCK_MACROS].sort((a, b) => t[a.key] / target[a.key] - t[b.key] / target[b.key])[0];
  return (
    <div className="stock-totals">
      <div className="stock-kcal">
        <strong>{Math.round(t.kcal).toLocaleString()}</strong>
        <span className="small muted">kcal at home</span>
      </div>
      {target && first && (
        <p className="stock-days">
          Enough for <strong>{lastsFor(t[first.key], target[first.key])}</strong>
          <span className="small muted"> · {first.label} {first.key === 'carbs' ? 'run' : 'runs'} out first</span>
        </p>
      )}
      <div className="stock-macros">
        {STOCK_MACROS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={m.key}
            aria-expanded={open === m.key}
            onClick={() => setOpen((o) => (o === m.key ? null : m.key))}>
            <strong>{Math.round(t[m.key])} g</strong>
            {m.label}
            {target && <span className="stock-lasts">lasts {lastsFor(t[m.key], target[m.key])}</span>}
          </button>
        ))}
      </div>
      {open && target && (
        <div className={`stock-sources ${open}`}>
          <p className="small">
            <strong>{Math.round(t[open])} g {open}</strong> at home · you need {target[open]} g a day, so it lasts{' '}
            <strong>{lastsFor(t[open], target[open])}</strong>
          </p>
          {counted
            .map((f) => ({ f, g: macrosFor(f, f.homeGrams!)[open] }))
            .filter((r) => r.g >= 0.5)
            .sort((a, b) => b.g - a.g)
            .map(({ f, g }) => (
              <div key={f.id} className="src-row">
                <span className="grow">
                  {f.name}
                  <span className="small muted">
                    {amountLabel(f.homeGrams!, f.pieceGrams)} at home · {Math.round((g / t[open]) * 100)}% of it
                  </span>
                </span>
                <strong>{Math.round(g)} g</strong>
              </div>
            ))}
          {t[open] < 0.5 && <p className="small muted">Nothing at home has {open}.</p>}
        </div>
      )}
      {anyCount > 0 && <p className="small muted">Plus {anyCount === 1 ? '1 food' : `${anyCount} foods`} set to "any", not counted. Enter an amount to include it.</p>}
    </div>
  );
}

function HomeRow({ food: f }: { food: Food }) {
  // Counted foods (eggs) are entered as pieces; stored as grams.
  const [amount, setAmount] = useState(f.homeGrams === null ? '' : showAmount(f.homeGrams, f.pieceGrams));
  // Follow changes made elsewhere (eating, buying), but not while the typed value already matches.
  useEffect(() => {
    const typed = amount.trim() === '' ? null : toGrams(num(amount), f.pieceGrams);
    if (typed === f.homeGrams || (typed !== null && f.homeGrams !== null && Math.abs(typed - f.homeGrams) < 0.5)) return;
    setAmount(f.homeGrams === null ? '' : showAmount(f.homeGrams, f.pieceGrams));
  }, [f.homeGrams]);
  const v = toGrams(num(amount), f.pieceGrams);
  const invalid = amount.trim() !== '' && !(v >= 0 && v <= 20000);
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
          label={`Amount of ${f.name} at home`}
          value={amount}
          placeholder="any"
          suffix={unitOf(f.pieceGrams)}
          onChange={(t) => {
            setAmount(t);
            const n = toGrams(num(t), f.pieceGrams);
            if (t.trim() === '') void setHomeGrams(f.id, null);
            else if (n >= 0 && n <= 20000) void setHomeGrams(f.id, n);
          }}
        />
      )}
    </div>
  );
}

/** Exact grams of at-home foods that fill the rest of the day's macros. */
const SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const;

export function SuggestScreen({ remaining, loggedAt }: { remaining: Macros; loggedAt: string }) {
  const nav = useNav();
  const [size, setSize] = useState<MealSize>(() => {
    const saved = localStorage.getItem('meal-size');
    return saved && saved in MEAL_SIZES ? (saved as MealSize) : 'medium';
  });
  const day = ymd(new Date(loggedAt));
  const data = useLive(
    async () => ({ foods: await listFoods(), usual: await usualPortions(), logs: await listLogs(day) }),
    ['foods', 'food_logs', 'food_log_items'],
    [day],
  );
  const targets = useTargets([day]);
  if (!data || !targets) return null;
  const { foods, usual, logs } = data;
  const meal = mealTarget(remaining, targets.get(day)!.kcal, size);
  // Grams of each food already eaten that day, so daily limits count it.
  const eaten = new Map<string, number>();
  for (const i of logs.flatMap((l) => l.items)) if (i.foodId) eaten.set(i.foodId, (eaten.get(i.foodId) ?? 0) + i.grams);
  const home = foods.filter((f) => f.atHome); // butter included: it's a fat source too (capped like other dense foods)
  // Chicken and eggs are cooked in butter: use the butter from My Diet (at home first).
  const butter = foods.find((f) => isButter(f) && f.atHome) ?? foods.find(isButter) ?? null;
  const options = suggestOptions(
    meal,
    home.map((f) => ({
      ...f,
      maxGrams: maxGramsFor(f.kcal, usual.get(f.id), f.homeGrams, f.dailyMaxGrams === null ? null : f.dailyMaxGrams - (eaten.get(f.id) ?? 0), f.minGrams),
      // A pairing with a deleted food is ignored; one with a food that's not at home rules this food out.
      needs: f.pairsWith.filter((id) => foods.some((x) => x.id === id)),
    })),
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
      <Segmented
        options={SIZE_OPTIONS}
        value={size}
        onChange={(s) => {
          localStorage.setItem('meal-size', s);
          animate('fade', () => setSize(s));
        }}
      />
      <div className="card">
        <span className="label">{SIZE_OPTIONS.find((o) => o.value === size)!.label} meal</span>
        <p>
          {left(meal.kcal)} kcal · P {left(meal.protein)} g · C {left(meal.carbs)} g · F {left(meal.fat)} g
        </p>
        <p className="small muted">
          {left(remaining.kcal)} kcal left today
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
                <strong>{amountLabel(i.grams, foods.find((f) => f.id === i.foodId)?.pieceGrams)}</strong>
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
