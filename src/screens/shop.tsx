import { useEffect, useState } from 'react';

import { Page, Segmented } from '@/components/ui';
import { listFoods, restock, type Food } from '@/db/diet';
import { itemsBetween, listLogs } from '@/db/log';
import { dayTargets } from '@/db/activity';
import { localDate, type Profile } from '@/db/profile';
import { addDays } from '@/lib/history';
import { useAccount } from '@/lib/account';
import { animate } from '@/lib/motion';
import { amountLabel, macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { money, packsFor } from '@/lib/price';
import { cheapestBuy, usualBuy } from '@/lib/shop-plan';
import { maxGramsFor, planShopping } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';

const isButter = (f: Food) => /butter/i.test(f.name);
const pos = (n: number) => Math.max(0, n);

export type ShopMode = 'usual' | 'cheapest';

/** Can what's at home cover the rest of today plus the next `days` days? If not, what to buy:
 *  "usual" restocks what you normally eat (falls back to filling your macros with under a week of logs),
 *  "cheapest" is the lowest-cost mix of your priced foods that covers your macros. */
async function loadShopping(profile: Profile, days: number, mode: ShopMode) {
  const today = localDate();
  const [foods, logs, history] = await Promise.all([listFoods(), listLogs(today), itemsBetween(addDays(today, -28), today)]);
  const past = [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, -n));
  const all = await dayTargets(profile, [today, ...past], today);
  const t = all.get(today)!;
  // Later days: your average day this past week (today's target is still low before you've walked).
  const week = past.map((d) => all.get(d)!);
  const avg = (k: keyof Macros) => week.reduce((s, x) => s + x[k], 0) / week.length;
  const items = logs.flatMap((l) => l.items);
  const eatenMacros = sumMacros(items.map((i) => macrosFor(i.per100, i.grams)));
  const eaten = new Map<string, number>();
  for (const i of items) if (i.foodId) eaten.set(i.foodId, (eaten.get(i.foodId) ?? 0) + i.grams);
  const daily = { kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') };
  const required = {
    kcal: pos(t.kcal - eatenMacros.kcal) + days * daily.kcal,
    protein: pos(t.protein - eatenMacros.protein) + days * daily.protein,
    carbs: pos(t.carbs - eatenMacros.carbs) + days * daily.carbs,
    fat: pos(t.fat - eatenMacros.fat) + days * daily.fat,
  };
  const span = days + 1; // today counts as a day for limits and caps
  // The daily limit for every day in the span, minus what's already eaten today.
  const limitLeft = (f: Food) => (f.dailyMaxGrams === null ? Infinity : pos(f.dailyMaxGrams * span - (eaten.get(f.id) ?? 0)));
  const needs = (f: Food) => f.pairsWith.filter((id) => foods.some((x) => x.id === id));
  const butter = foods.find((f) => isButter(f) && f.atHome) ?? foods.find(isButter) ?? null;
  // At home: up to what you have. "Any" has no amount, so it counts as a normal portion cap for each day
  // (otherwise 500 g of honey would look like a plan).
  const capForSpan = (f: Food) => span * maxGramsFor(f.kcal, f.defaultGrams ?? undefined, null, null, f.minGrams, f.maxPortionGrams);
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
  const macro = planShopping(required, daily, stock, catalog, butter);
  const base = { ...macro, foods, required, days, mode };
  if (mode === 'usual') {
    const usual = usualBuy(history, eaten, foods, today, days);
    if (!usual) return { ...base, note: 'Under a week of logs, so for now this fills your macros. Once you have a week, it restocks what you usually eat.' };
    return { ...base, buy: usual.buy, needed: usual.buy.length > 0, note: `What you usually eat, from your last ${usual.historyDays} days of logs, minus what's at home.` };
  }
  // Cheapest: only foods with a pack size and price; each still capped at normal portions for the days.
  const priced = catalog.filter((f) => f.packGrams && f.packPrice !== null);
  const cheap = cheapestBuy(macro.short, priced.map((f) => ({ ...f, pricePer100: (f.packPrice! / f.packGrams!) * 100 })));
  const notes = [
    cheap.feasible ? 'The lowest-cost mix of your priced foods that covers your macros.' : "Your priced foods can't cover all your macros in normal portions, so this gets as close as it can.",
    priced.length < foods.length ? `Only foods with a shopping size and price count (${priced.length} of ${foods.length}).` : '',
  ];
  return { ...base, buy: cheap.buy, needed: macro.needed, note: notes.filter(Boolean).join(' ') };
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

/** Recommended or cheapest list, remembered like the days. */
export function useShopMode() {
  const read = (): ShopMode => (localStorage.getItem('shop-mode') === 'cheapest' ? 'cheapest' : 'usual');
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const update = () => setMode(read());
    window.addEventListener('shopmode', update);
    return () => window.removeEventListener('shopmode', update);
  }, []);
  const choose = (m: ShopMode) => {
    localStorage.setItem('shop-mode', m);
    window.dispatchEvent(new Event('shopmode'));
  };
  return [mode, choose] as const;
}

/** "tomorrow" or "the next 3 days". */
export const horizon = (days: number) => (days === 1 ? 'tomorrow' : `the next ${days} days`);

/** The shopping check for today, or undefined while loading. */
export function useShopping() {
  const { profile } = useAccount();
  const [days] = useShopDays();
  const [mode] = useShopMode();
  return useLive(async () => (profile ? loadShopping(profile, days, mode) : null), ['foods', 'food_logs', 'food_log_items', 'daily_steps', 'workouts', 'workout_sets'], [profile, days, mode]);
}

const MODE_OPTIONS = [
  { value: 'usual', label: 'Recommended' },
  { value: 'cheapest', label: 'Cheapest' },
] as const;

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
  const [mode, setMode] = useShopMode();
  const [open, setOpen] = useState<(typeof MACROS)[number]['key'] | null>(null);
  const tabs = (
    <div className="shop-days">
      <span className="small muted">Shop for the rest of today plus</span>
      <Segmented options={DAY_OPTIONS} value={days} onChange={(d) => animate('fade', () => setDays(d))} />
      <Segmented options={MODE_OPTIONS} value={mode} onChange={(m) => animate('fade', () => setMode(m))} />
    </div>
  );
  if (!plan) return tabs;
  const stock = <StockCards plan={plan} />;
  if (!plan.needed) {
    return (
      <>
        {tabs}
        {stock}
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
  // Whole packs of the shopping size you set; foods without one are bought by amount.
  const rows = plan.buy.map((b) => {
    const f = plan.foods.find((x) => x.id === b.foodId)!;
    const packs = f.packGrams ? packsFor(b.grams, f.packGrams) : null;
    const price = packs !== null && f.packPrice !== null ? packs * f.packPrice : null;
    return { b, f, packs, price };
  });
  const total = rows.reduce((t, r) => t + (r.price ?? 0), 0);
  const unpriced = rows.filter((r) => r.price === null).length;
  return (
    <section className="smart-list">
      {tabs}
      {stock}
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
      {plan.note && <p className="small muted">{plan.note}</p>}
      <div className="list buy-list">
        {rows.map(({ b, f, packs, price }) => {
          const m = covered(b.grams, f);
          return (
            <label key={b.foodId} className="buy-row">
              <input
                type="checkbox"
                onChange={(e) => e.target.checked && restock(f.id, packs !== null ? packs * f.packGrams! : b.grams)}
                aria-label={`Bought ${f.name}`}
              />
              <span className="buy-main">
                <span className="list-title">{f.name}</span>
                <span className="buy-covers small">
                  <span className="protein">P {Math.round(m.protein)}</span>
                  <span className="carbs">C {Math.round(m.carbs)}</span>
                  <span className="fat">F {Math.round(m.fat)}</span>
                </span>
              </span>
              <span className="buy-amount">
                <strong>{packs !== null ? `${packs} × ${amountLabel(f.packGrams!, f.pieceGrams)}` : amountLabel(b.grams, f.pieceGrams)}</strong>
                <span className="small muted">
                  {packs !== null && `need ${amountLabel(b.grams, f.pieceGrams)}`}
                  {packs !== null && price !== null && ' · '}
                  {price !== null && money(price)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {total > 0 && (
        <div className="card buy-total">
          <span>
            <strong>Total</strong>
            {unpriced > 0 && (
              <span className="small muted">{unpriced === 1 ? '1 item has no price, so it isn\'t counted' : `${unpriced} items have no price, so they aren't counted`}</span>
            )}
          </span>
          <strong className="buy-total-price">{money(total)}</strong>
        </div>
      )}
      <p className="small muted">Tick things off as you buy them; they go straight into At home.</p>
    </section>
  );
}

/** What's at home against the plan: none of it, low (the list buys more, or less than one usual portion left), or enough. */
function StockCards({ plan }: { plan: Plan }) {
  const buying = new Set(plan.buy.map((b) => b.foodId));
  const out = plan.foods.filter((f) => !f.atHome || f.homeGrams === 0);
  const have = plan.foods.filter((f) => f.atHome && f.homeGrams !== 0);
  const isLow = (f: Food) => buying.has(f.id) || (f.homeGrams !== null && f.homeGrams < (f.defaultGrams ?? f.pieceGrams ?? 100));
  const low = have.filter(isLow);
  const enough = have.filter((f) => !isLow(f));
  const when = `the rest of today and ${horizon(plan.days)}`;
  return (
    <>
      {out.length > 0 && <StockCard tone="out" title={`Out of ${plural(out.length)}`} note="In My Diet, but none at home." foods={out} />}
      {low.length > 0 && <StockCard tone="low" title={`Low on ${plural(low.length)}`} note={`Won't last ${when}.`} foods={low} amounts />}
      {enough.length > 0 && <StockCard tone="ok" title={`Enough of ${plural(enough.length)}`} note={`Covers ${when}.`} foods={enough} amounts />}
    </>
  );
}

const plural = (n: number) => (n === 1 ? '1 food' : `${n} foods`);

function StockCard({ tone, title, note, foods, amounts }: { tone: 'out' | 'low' | 'ok'; title: string; note: string; foods: Food[]; amounts?: boolean }) {
  return (
    <div className={`card stock-card ${tone}`}>
      <div className="stock-head">
        <span className="stock-dot" aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <span className="small muted">{note}</span>
        </span>
      </div>
      <div className="stock-chips">
        {foods.map((f) => (
          <span key={f.id} className="stock-chip">
            {f.name}
            {amounts && f.homeGrams !== null && <span className="muted"> · {amountLabel(f.homeGrams, f.pieceGrams)}</span>}
          </span>
        ))}
      </div>
    </div>
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

/** Where a macro comes from: what's needed, what's at home (food by food), and what the list adds. */
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
      <p className="src-group">At home · {sum(home)} g</p>
      {home.length === 0 && <p className="small muted">Nothing at home adds {label}.</p>}
      {home.map(({ f, grams, g }) => (
        <div key={f.id} className="src-row">
          <span className="grow">
            {f.name}
            <span className="small muted">
              {f.homeGrams === null
                ? `any amount · counted as ${amountLabel(grams, f.pieceGrams)}`
                : grams < f.homeGrams - 0.5
                  ? `${amountLabel(grams, f.pieceGrams)} of ${amountLabel(f.homeGrams, f.pieceGrams)} · daily limit`
                  : amountLabel(grams, f.pieceGrams)}
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
    </div>
  );
}
