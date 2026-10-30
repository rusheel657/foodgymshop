import { useEffect, useRef, useState } from 'react';

import { Button, EmptyState, ListRow, NumberInput, num, Page, SectionHead } from '@/components/ui';
import { listFoods, listMeals, mealMacros, type Food, type Meal } from '@/db/diet';
import { deleteLog, saveLog, type FoodLog } from '@/db/log';
import { useAccount } from '@/lib/account';
import { useNav } from '@/lib/nav';
import { formatMacros, macrosFor, sumMacros, toLogItems, type LogItem } from '@/lib/nutrition';
import { deletePhoto, photoBase64, photoSrc } from '@/lib/photos';
import { analyzeMeal } from '@/lib/supabase';
import { useLive } from '@/lib/use-live';
import { FoodPickerScreen } from '@/screens/diet';

export const newLog = (loggedAt: string, patch: Partial<FoodLog> = {}): FoodLog => ({
  id: crypto.randomUUID(), loggedAt, mealId: null, photoPath: null, source: 'quick', items: [], ...patch,
});

const fromFood = (f: Food, grams: number): LogItem => ({
  foodId: f.id, name: f.name, grams, verified: true,
  per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
});

/** Sends the photo to analyze-meal, then replaces itself with the confirm screen. */
export function AnalyzeScreen({ photo, loggedAt }: { photo: string; loggedAt: string }) {
  const nav = useNav();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return; // StrictMode runs effects twice
    started.current = attempt;
    (async () => {
      try {
        const [foods, meals, image] = await Promise.all([listFoods(), listMeals(), photoBase64(photo)]);
        const ai = await analyzeMeal({
          image,
          foods: foods.map((f) => ({ id: f.id, name: f.name })),
          meals: meals.map((m) => ({
            id: m.id,
            name: m.name,
            items: m.items.flatMap((i) => {
              const f = foods.find((x) => x.id === i.foodId);
              return f ? [{ name: f.name, grams: i.grams }] : [];
            }),
          })),
        });
        const items = toLogItems(ai, foods, meals);
        const mealId = ai.find((a) => a.mealId)?.mealId ?? null;
        nav.pop();
        nav.push(
          <LogFormScreen
            log={newLog(loggedAt, { source: 'photo', photoPath: photo, mealId, items })}
            isNew
            notice={items.length === 0 ? 'Nothing recognised. Add what you ate below.' : undefined}
          />,
        );
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [attempt]);

  return (
    <Page title="Analysing">
      <div className="thumb wide">
        <img src={photoSrc(photo)} alt="Your meal" />
      </div>
      {!error && <p className="muted center">Looking at your plate…</p>}
      {error && (
        <>
          <p className="danger">{error}</p>
          <Button title="Try again" onClick={() => { setError(null); setAttempt((n) => n + 1); }} />
          <Button
            title="Quick add instead"
            variant="secondary"
            onClick={() => {
              nav.pop();
              nav.push(<LogFormScreen log={newLog(loggedAt, { source: 'photo', photoPath: photo })} isNew />);
            }}
          />
        </>
      )}
    </Page>
  );
}

/** Confirm a new entry (from a photo or quick-add) or edit a logged one. */
export function LogFormScreen({ log, isNew, notice }: { log: FoodLog; isNew?: boolean; notice?: string }) {
  const nav = useNav();
  const { userId } = useAccount();
  const foods = useLive(listFoods, ['foods']);
  const meals = useLive(listMeals, ['meals', 'meal_items']);
  const [items, setItems] = useState(log.items.map((item) => ({ item, grams: String(Math.round(item.grams)) })));
  const [mealId, setMealId] = useState(log.mealId);
  if (!foods || !meals) return null;

  const rows = items.map((r) => ({ ...r, g: num(r.grams) }));
  const total = sumMacros(rows.map((r) => macrosFor(r.item.per100, r.g || 0)));
  const invalid =
    rows.length === 0 ? 'Add at least one item.' : rows.some((r) => !(r.g > 0 && r.g <= 5000)) ? 'Each amount must be 1–5000 g.' : null;
  const add = (more: LogItem[]) => setItems((list) => [...list, ...more.map((item) => ({ item, grams: String(item.grams) }))]);

  async function save() {
    await saveLog(userId, { ...log, mealId, items: rows.map((r) => ({ ...r.item, grams: r.g })) });
    nav.pop();
  }

  async function remove() {
    if (!confirm('Delete this entry?')) return;
    await deleteLog(log.id);
    if (log.photoPath) await deletePhoto(log.photoPath);
    nav.pop();
  }

  return (
    <Page title={isNew ? 'Log food' : 'Edit entry'}>
      {log.photoPath && (
        <div className="thumb wide">
          <img src={photoSrc(log.photoPath)} alt="Your meal" />
        </div>
      )}
      {notice && <p className="muted">{notice}</p>}

      <section className="stack-sm">
        <SectionHead
          title="Items"
          action="+ Food"
          onAction={() =>
            nav.push(<FoodPickerScreen foods={foods} onPick={(f) => { add([fromFood(f, f.defaultGrams ?? 100)]); nav.pop(); }} />)
          }
        />
        {rows.length === 0 && <EmptyState text="No items yet." />}
        {rows.map((r, i) => (
          <div key={i} className="log-item">
            <div className="meal-item">
              <span className="meal-item-name">{r.item.name}</span>
              <NumberInput
                label={`${r.item.name} grams`}
                value={r.grams}
                onChange={(grams) => setItems((list) => list.map((x, j) => (j === i ? { ...x, grams } : x)))}
                suffix="g"
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${r.item.name}`}
                onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <span className="small muted">
              {!r.item.verified && <span className="tag">UNVERIFIED</span>}
              {formatMacros(macrosFor(r.item.per100, r.g || 0))}
            </span>
          </div>
        ))}
        {meals.length > 0 && (
          <Button
            title="+ Add a saved meal"
            variant="secondary"
            onClick={() =>
              nav.push(
                <MealPickerScreen
                  meals={meals}
                  foods={foods}
                  onPick={(m) => {
                    add(m.items.flatMap((i) => {
                      const f = foods.find((x) => x.id === i.foodId);
                      return f ? [fromFood(f, i.grams)] : [];
                    }));
                    setMealId((id) => id ?? m.id);
                    nav.pop();
                  }}
                />,
              )
            }
          />
        )}
      </section>

      <div className="card">
        <h2>{Math.round(total.kcal)} kcal</h2>
        <p className="muted">
          P {Math.round(total.protein)} g · C {Math.round(total.carbs)} g · F {Math.round(total.fat)} g
        </p>
        {rows.some((r) => !r.item.verified) && (
          <p className="small muted">Unverified items are AI estimates, not from My Diet.</p>
        )}
      </div>

      {invalid && <p className="small muted">{invalid}</p>}
      <Button title={isNew ? 'Log' : 'Save'} onClick={save} disabled={!!invalid} />
      {!isNew && <Button title="Delete entry" variant="secondary" onClick={remove} />}
    </Page>
  );
}

function MealPickerScreen({ meals, foods, onPick }: { meals: Meal[]; foods: Food[]; onPick: (meal: Meal) => void }) {
  return (
    <Page title="Choose meal">
      <div className="list">
        {meals.map((m) => (
          <ListRow key={m.id} title={m.name} subtitle={formatMacros(mealMacros(m, foods))} onClick={() => onPick(m)} />
        ))}
      </div>
    </Page>
  );
}
