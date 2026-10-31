import { useEffect, useState } from 'react';

import { Page, Segmented } from '@/components/ui';
import { listFoods, restock, type Food } from '@/db/diet';
import { listLogs } from '@/db/log';
import { localDate, targetsFor, type Profile } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { animate } from '@/lib/motion';
import { amountLabel, macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { maxGramsFor, planShopping } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';

const isButter = (f: Food) => /butter/i.test(f.name);
const pos = (n: number) => Math.max(0, n);

/** Can what's at home cover the rest of today plus the next `days` days? If not, what to buy. */
async function loadShopping(profile: Profile, days: number) {
  const [foods, logs] = await Promise.all([listFoods(), listLogs(localDate())]);
  const t = targetsFor(profile);
  const items = logs.flatMap((l) => l.items);
  const eatenMacros = sumMacros(items.map((i) => macrosFor(i.per100, i.grams)));
  const eaten = new Map<string, number>();
  for (const i of items) if (i.foodId) eaten.set(i.foodId, (eaten.get(i.foodId) ?? 0) + i.grams);
  const daily = { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat };
  const required = {
    kcal: pos(t.kcal - eatenMacros.kcal) + days * t.kcal,
    protein: pos(t.protein - eatenMacros.protein) + days * t.protein,
    carbs: pos(t.carbs - eatenMacros.carbs) + days * t.carbs,
    fat: pos(t.fat - eatenMacros.fat) + days * t.fat,
  };
  const span = days + 1; // today counts as a day for limits and caps
  // The daily limit for every day in the span, minus what's already eaten today.
  const limitLeft = (f: Food) => (f.dailyMaxGrams === null ? Infinity : pos(f.dailyMaxGrams * span - (eaten.get(f.id) ?? 0)));
  const needs = (f: Food) => f.pairsWith.filter((id) => foods.some((x) => x.id === id));
  const butter = foods.find((f) => isButter(f) && f.atHome) ?? foods.find(isButter) ?? null;
  // At home: up to what you have. "Any" has no amount, so it counts as a normal portion cap for each day
  // (otherwise 500 g of honey would look like a plan).
  const capForSpan = (f: Food) => span * maxGramsFor(f.kcal, undefined, null, null, f.minGrams);
  const atHome = (f: Food) => (f.atHome ? Math.min(f.homeGrams ?? capForSpan(f), limitLeft(f)) : 0);
  // Butter counts as a food too (its fat is real food at home), besides being cooking butter for chicken and eggs.
  const stock = foods.filter((f) => f.atHome).map((f) => ({ ...f, needs: needs(f), maxGrams: atHome(f) }));
  // To buy: a normal portion cap for each day (50 g a day for dense foods like honey or chocolate),
  // and never so much that home + bought passes the daily limit.
  const catalog = foods.map((f) => ({
    ...f,
    needs: needs(f),
    maxGrams: Math.max(0, Math.min(capForSpan(f), limitLeft(f) - atHome(f))),
  }));
  return { ...planShopping(required, daily, stock, catalog, butter), foods, required, days };
}

/** How many days ahead to shop for (1–5), remembered and shared by the Shopping page and the Food tab alert. */
export function useShopDays() {
  const read = () => Math.min(5, Math.max(1, Number(localStorage.getItem('shop-days')) || 1));
  const [days, setDays] = useState(read);
  useEffect(() => {
    const update = () => setDays(read());
    window.addEventListener('shopdays', update);
    return () => window.removeEventListener('shopdays', update);
  }, []);
  const choose = (d: number) => {
    localStorage.setItem('shop-days', String(d));
    window.dispatchEvent(new Event('shopdays'));
  };
  return [days, choose] as const;
}

/** "tomorrow" or "the next 3 days". */
export const horizon = (days: number) => (days === 1 ? 'tomorrow' : `the next ${days} days`);

/** The shopping check for today, or undefined while loading. */
export function useShopping() {
  const { profile } = useAccount();
  const [days] = useShopDays();
  return useLive(async () => (profile ? loadShopping(profile, days) : null), ['foods', 'food_logs', 'food_log_items'], [profile, days]);
}

const DAY_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({ value: d, label: d === 1 ? '1 day' : `${d} days` }));

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

/** "What to buy" — the auto-made part of the shopping list. */
export function SmartList() {
  const plan = useShopping();
  const [days, setDays] = useShopDays();
  const [open, setOpen] = useState<(typeof MACROS)[number]['key'] | null>(null);
  const tabs = (
    <div className="shop-days">
      <span className="small muted">Shop for the rest of today plus</span>
      <Segmented options={DAY_OPTIONS} value={days} onChange={(d) => animate('fade', () => setDays(d))} />
    </div>
  );
  if (!plan) return tabs;
  if (!plan.needed) {
    return (
      <>
        {tabs}
        <div className="shop-ok">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          <div>
            <strong>You're stocked</strong>
            <p className="small muted">What's at home covers the rest of today and {horizon(plan.days)}.</p>
          </div>
        </div>
      </>
    );
  }
  const covered = (grams: number, f: Food): Macros => macrosFor(f, grams);
  return (
    <section className="smart-list">
      {tabs}
      <div className="shop-alert">
        <span className="shop-alert-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01" />
          </svg>
        </span>
        <div>
          <strong>Time to go shopping</strong>
          <p className="small">What's at home won't cover the rest of today and {horizon(plan.days)}.</p>
        </div>
      </div>

      <div className="short-chips">
        {MACROS.filter((m) => plan.short[m.key] >= 1).map((m) => (
          <button
            key={m.key}
            type="button"
            className={`short-chip ${m.key}`}
            aria-expanded={open === m.key}
            onClick={() => setOpen((o) => (o === m.key ? null : m.key))}>
            {m.label} <strong>−{Math.round(plan.short[m.key])} g</strong>
          </button>
        ))}
      </div>
      {open && <Sources macro={open} plan={plan} />}

      <h2 className="buy-title">What to buy</h2>
      <div className="list buy-list">
        {plan.buy.map((b) => {
          const f = plan.foods.find((x) => x.id === b.foodId)!;
          const m = covered(b.grams, f);
          return (
            <label key={b.foodId} className="buy-row">
              <input type="checkbox" onChange={(e) => e.target.checked && restock(f.id, b.grams)} aria-label={`Bought ${f.name}`} />
              <span className="buy-main">
                <span className="list-title">{f.name}</span>
                <span className="buy-covers small">
                  <span className="protein">P {Math.round(m.protein)}</span>
                  <span className="carbs">C {Math.round(m.carbs)}</span>
                  <span className="fat">F {Math.round(m.fat)}</span>
                </span>
              </span>
              <span className="buy-amount">
                <strong>{amountLabel(b.grams, f.pieceGrams)}</strong>
                {f.shopUnit && <span className="small muted">{f.shopUnit}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className="small muted">Tick things off as you buy them; they go straight into At home.</p>
    </section>
  );
}

export function ShoppingScreen() {
  return (
    <Page title="Shopping">
      <SmartList />
    </Page>
  );
}

type Plan = NonNullable<ReturnType<typeof useShopping>>;

/** Where a macro comes from: what's needed, what home stock covers (food by food), and what the list adds. */
function Sources({ macro, plan }: { macro: (typeof MACROS)[number]['key']; plan: Plan }) {
  const label = MACROS.find((m) => m.key === macro)!.label.toLowerCase();
  const rows = (items: { foodId: string; grams: number }[]) =>
    items
      .map((p) => {
        const f = plan.foods.find((x) => x.id === p.foodId)!;
        return { f, grams: p.grams, g: macrosFor(f, p.grams)[macro] };
      })
      .filter((r) => r.g >= 0.5)
      .sort((a, b) => b.g - a.g);
  const home = rows(plan.fromHome);
  const buy = rows(plan.buy);
  const sum = (r: { g: number }[]) => Math.round(r.reduce((s, x) => s + x.g, 0));
  return (
    <div className={`sources ${macro}`}>
      <div className="src-line">
        <span>Needed for the rest of today + {horizon(plan.days)}</span>
        <strong>{Math.round(plan.required[macro])} g</strong>
      </div>
      <p className="src-group">From what's at home · {sum(home)} g</p>
      {home.length === 0 && <p className="small muted">Nothing at home adds {label}.</p>}
      {home.map(({ f, grams, g }) => (
        <div key={f.id} className="src-row">
          <span className="grow">
            {f.name}
            <span className="small muted">
              uses {amountLabel(grams, f.pieceGrams)}
              {f.homeGrams !== null ? ` of ${amountLabel(f.homeGrams, f.pieceGrams)} you have` : ''}
            </span>
          </span>
          <strong>{Math.round(g)} g</strong>
        </div>
      ))}
      <div className="src-line short">
        <span>Short</span>
        <strong>−{Math.round(plan.short[macro])} g</strong>
      </div>
      {buy.length > 0 && <p className="src-group">The list adds · {sum(buy)} g</p>}
      {buy.map(({ f, grams, g }) => (
        <div key={f.id} className="src-row">
          <span className="grow">
            {f.name}
            <span className="small muted">buy {amountLabel(grams, f.pieceGrams)}</span>
          </span>
          <strong>+{Math.round(g)} g</strong>
        </div>
      ))}
      <p className="small muted">
        Home stock isn't all used when other limits apply (daily limits, smallest portions, pairings) or when using more would overshoot other macros.
      </p>
    </div>
  );
}
