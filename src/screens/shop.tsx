import { Page } from '@/components/ui';
import { listFoods, restock, type Food } from '@/db/diet';
import { listLogs } from '@/db/log';
import { localDate, targetsFor, type Profile } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { amountLabel, macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { maxGramsFor, planShopping } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';

const isButter = (f: Food) => /butter/i.test(f.name);
const pos = (n: number) => Math.max(0, n);

/** Can what's at home cover the rest of today plus tomorrow? If not, what to buy. Reloads as you log, shop or restock. */
async function loadShopping(profile: Profile) {
  const [foods, logs] = await Promise.all([listFoods(), listLogs(localDate())]);
  const t = targetsFor(profile);
  const items = logs.flatMap((l) => l.items);
  const eatenMacros = sumMacros(items.map((i) => macrosFor(i.per100, i.grams)));
  const eaten = new Map<string, number>();
  for (const i of items) if (i.foodId) eaten.set(i.foodId, (eaten.get(i.foodId) ?? 0) + i.grams);
  const daily = { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat };
  const required = {
    kcal: pos(t.kcal - eatenMacros.kcal) + t.kcal,
    protein: pos(t.protein - eatenMacros.protein) + t.protein,
    carbs: pos(t.carbs - eatenMacros.carbs) + t.carbs,
    fat: pos(t.fat - eatenMacros.fat) + t.fat,
  };
  // Two days of a daily limit, minus what's already eaten today.
  const limitLeft = (f: Food) => (f.dailyMaxGrams === null ? Infinity : pos(f.dailyMaxGrams * 2 - (eaten.get(f.id) ?? 0)));
  const needs = (f: Food) => f.pairsWith.filter((id) => foods.some((x) => x.id === id));
  const butter = foods.find((f) => isButter(f) && f.atHome) ?? foods.find(isButter) ?? null;
  // At home: up to what you have ("any" = plenty).
  const atHome = (f: Food) => (f.atHome ? Math.min(f.homeGrams ?? 5000, limitLeft(f)) : 0);
  const stock = foods.filter((f) => f.atHome && !isButter(f)).map((f) => ({ ...f, needs: needs(f), maxGrams: atHome(f) }));
  // To buy: two days' worth of a normal portion cap (100 g for dense foods like honey or chocolate),
  // and never so much that home + bought passes the daily limit.
  const catalog = foods.filter((f) => !isButter(f)).map((f) => ({
    ...f,
    needs: needs(f),
    maxGrams: Math.max(0, Math.min(2 * maxGramsFor(f.kcal, undefined, null, null, f.minGrams), limitLeft(f) - atHome(f))),
  }));
  return { ...planShopping(required, daily, stock, catalog, butter), foods };
}

/** The shopping check for today, or undefined while loading. */
export function useShopping() {
  const { profile } = useAccount();
  return useLive(async () => (profile ? loadShopping(profile) : null), ['foods', 'food_logs', 'food_log_items'], [profile]);
}

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

/** "What to buy" — the auto-made part of the shopping list. */
export function SmartList() {
  const plan = useShopping();
  if (!plan) return null;
  if (!plan.needed) {
    return (
      <div className="shop-ok">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <div>
          <strong>You're stocked</strong>
          <p className="small muted">What's at home covers the rest of today and all of tomorrow.</p>
        </div>
      </div>
    );
  }
  const covered = (grams: number, f: Food): Macros => macrosFor(f, grams);
  return (
    <section className="smart-list">
      <div className="shop-alert">
        <span className="shop-alert-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01" />
          </svg>
        </span>
        <div>
          <strong>Time to go shopping</strong>
          <p className="small">What's at home won't cover the rest of today and tomorrow.</p>
        </div>
      </div>

      <div className="short-chips">
        {MACROS.filter((m) => plan.short[m.key] >= 1).map((m) => (
          <span key={m.key} className={`short-chip ${m.key}`}>
            {m.label} <strong>−{Math.round(plan.short[m.key])} g</strong>
          </span>
        ))}
      </div>

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
