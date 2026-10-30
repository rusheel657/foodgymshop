import { Button, EmptyState, Page } from '@/components/ui';
import { listFoods, setAtHome, type Food } from '@/db/diet';
import { usualPortions } from '@/db/log';
import { useNav } from '@/lib/nav';
import { formatMacros, macrosFor, sumMacros, type LogItem, type Macros } from '@/lib/nutrition';
import { maxGramsFor, suggest } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';
import { LogFormScreen, newLog } from '@/screens/log';

const isButter = (f: Food) => /butter/i.test(f.name);

/** Tick the My Diet foods you have in the kitchen right now. */
export function AtHomeScreen() {
  const foods = useLive(listFoods, ['foods']);
  if (!foods) return null;
  return (
    <Page title="At home">
      <p className="muted">Tick what's in your kitchen. Suggestions only use these.</p>
      {foods.length === 0 && <EmptyState text="Add foods in My Diet first." />}
      <div className="list">
        {foods.map((f) => (
          <label key={f.id} className="list-row check-row">
            <span>
              <span className="list-title">{f.name}</span>
              <span className="small muted">{f.shopUnit ?? '100 g'} · {formatMacros(f)}</span>
            </span>
            <input type="checkbox" checked={f.atHome} onChange={(e) => setAtHome(f.id, e.target.checked)} />
          </label>
        ))}
      </div>
    </Page>
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
  const plan = suggest(
    remaining,
    home.map((f) => ({ ...f, maxGrams: maxGramsFor(f.kcal, usual.get(f.id)) })),
    butter,
  );
  const items: LogItem[] = plan.map((p) => {
    const f = foods.find((x) => x.id === p.foodId)!;
    return { foodId: f.id, name: f.name, grams: p.grams, verified: true, per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat } };
  });
  const total = sumMacros(items.map((i) => macrosFor(i.per100, i.grams)));
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
      ) : items.length === 0 ? (
        <EmptyState text="You've hit your targets for today." />
      ) : (
        <>
          <div className="list">
            {items.map((i) => (
              <div key={i.foodId} className="list-row">
                <span>
                  <span className="list-title">
                    <strong>{i.grams} g</strong> {i.name}
                  </span>
                  <span className="small muted">
                    {formatMacros(macrosFor(i.per100, i.grams))}
                    {butter && i.foodId === butter.id ? ' · for cooking' : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <span className="label">This adds</span>
            <p>{formatMacros(total)}</p>
          </div>
          <Button
            title="Log this"
            onClick={() => {
              nav.pop();
              nav.push(<LogFormScreen log={newLog(loggedAt, { items })} isNew />);
            }}
          />
        </>
      )}
      <Button title="Edit what's at home" variant="secondary" onClick={() => nav.push(<AtHomeScreen />)} />
    </Page>
  );
}
