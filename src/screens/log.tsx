import { useEffect, useRef, useState } from 'react';

import { LinkIcon, FoodGrid } from '@/components/food-grid';
import { Button, EmptyState, Field, ListRow, NumberInput, num, Page, SectionHead, TextInput } from '@/components/ui';
import { listFoods, listMeals, mealMacros, saveMeal, type Food, type Meal } from '@/db/diet';
import { deleteLog, logTimeFor, recentCorrections, saveCorrections, saveLog, usualPortions, type FoodLog } from '@/db/log';
import { localDate } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { lookupBarcode, scanBarcode } from '@/lib/barcode';
import { useNav } from '@/lib/nav';
import {
  correctionNote, diffCorrections, formatMacros, macrosFor, showAmount, sumMacros, toGrams, toLogItems, unitOf, type LogItem,
} from '@/lib/nutrition';
import { canUseCamera, deletePhoto, photoBase64, photoSrc } from '@/lib/photos';
import { money, priceFor } from '@/lib/price';
import { habitsLink, mealTitle, postMealToHabits } from '@/lib/rshabits';
import { analyzeMeal } from '@/lib/supabase';
import { BUTTER_PER_GRAM } from '@/lib/suggest';
import { pairLinks } from '@/lib/pairs';
import { useLive } from '@/lib/use-live';
import { FoodPickerScreen } from '@/screens/diet';

export const newLog = (loggedAt: string, patch: Partial<FoodLog> = {}): FoodLog => ({
  id: crypto.randomUUID(), loggedAt, mealId: null, photoPath: null, source: 'quick', items: [], ...patch,
});

const fromFood = (f: Food, grams: number): LogItem => ({
  foodId: f.id, name: f.name, grams, verified: true,
  per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
});

const mealItems = (m: Meal, foods: Food[]) =>
  m.items.flatMap((i) => {
    const f = foods.find((x) => x.id === i.foodId);
    return f ? [fromFood(f, i.grams)] : [];
  });

/** A one-off item from a scanned barcode: your My Diet food if it has that barcode, else the Open Food Facts product
 *  (100 g to start, not added to My Diet). null when cancelled. */
async function scanItem(foods: Food[]): Promise<LogItem | null> {
  try {
    const code = await scanBarcode();
    if (!code) return null;
    const mine = foods.find((f) => f.barcode === code && !f.disabled);
    if (mine) return fromFood(mine, mine.defaultGrams ?? mine.pieceGrams ?? 100);
    const found = await lookupBarcode(code);
    if (!found) {
      alert(`Barcode ${code} isn't in Open Food Facts. Add it in My Diet from the label instead.`);
      return null;
    }
    const { name, kcal, protein, carbs, fat } = found;
    return { foodId: null, name, grams: 100, verified: true, per100: { kcal, protein, carbs, fat } };
  } catch (e) {
    alert((e as Error).message);
    return null;
  }
}

/** The user's standing cooking rule (see suggest.ts): chicken and eggs are cooked in their butter. */
function butterRule(foods: Food[]) {
  const butter = foods.find((f) => /butter/i.test(f.name));
  return butter
    ? [`Chicken and eggs are always cooked in "${butter.name}": whenever chicken or eggs are present, also include it (about ${BUTTER_PER_GRAM * 100} g per 100 g of chicken or eggs).`]
    : [];
}

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
        const [foods, meals, image, usual, corrections] = await Promise.all([
          listFoods(true), listMeals(), photoBase64(photo), usualPortions(), recentCorrections(),
        ]);
        const ai = await analyzeMeal({
          image,
          foods: foods.filter((f) => !f.disabled).map((f) => ({ id: f.id, name: f.name, usualGrams: usual.get(f.id) })),
          notes: corrections.map(correctionNote),
          rules: butterRule(foods.filter((f) => !f.disabled)),
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
        nav.replace(
          <LogFormScreen
            log={newLog(loggedAt, { source: 'photo', photoPath: photo, mealId, items })}
            isNew
            aiItems={items}
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
              nav.replace(<LogFormScreen log={newLog(loggedAt, { source: 'photo', photoPath: photo })} isNew />);
            }}
          />
        </>
      )}
    </Page>
  );
}

/** Quick add: tap the foods you ate on their cards, then set amounts on the next screen. */
export function QuickLogScreen({ loggedAt }: { loggedAt: string }) {
  const nav = useNav();
  const foods = useLive(() => listFoods(), ['foods']);
  const meals = useLive(listMeals, ['meals', 'meal_items']);
  const [picked, setPicked] = useState<string[]>([]);
  if (!foods || !meals) return null;
  const links = pairLinks(foods);
  const chosen = picked.flatMap((id) => foods.find((f) => f.id === id) ?? []);
  // Picked foods that are only eaten with others not picked yet, e.g. yoghurt without its honey.
  const hints = chosen
    .map((f) => ({ food: f, missing: links.needs(f.id).filter((p) => !picked.includes(p.id)) }))
    .filter((h) => h.missing.length > 0);
  const wanted = new Set(hints.flatMap((h) => h.missing.map((f) => f.id)));
  const toggle = (f: Food) => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]));
  const next = (items: LogItem[], mealId: string | null = null) => nav.replace(<LogFormScreen log={newLog(loggedAt, { items, mealId })} isNew />);
  const pickedItems = () => chosen.map((f) => fromFood(f, f.defaultGrams ?? f.pieceGrams ?? 100));

  return (
    <Page title="Quick add">
      {foods.length === 0 ? (
        <EmptyState text="Add foods in My Diet first." />
      ) : (
        <p className="small muted">Tap what you ate. You set the amounts next.</p>
      )}
      {canUseCamera && (
        <Button
          title="Scan a barcode"
          variant="secondary"
          onClick={async () => {
            const item = await scanItem(foods);
            if (item) next([...pickedItems(), item]);
          }}
        />
      )}
      {hints.map((h) => (
        <div key={h.food.id} className="pair-hint">
          <LinkIcon />
          <span className="grow">
            <strong>{h.food.name}</strong> goes with {h.missing.map((f) => f.name).join(' + ')}
          </span>
          <button type="button" className="button primary small" onClick={() => setPicked((p) => [...p, ...h.missing.map((f) => f.id)])}>
            Add
          </button>
        </div>
      ))}
      <FoodGrid foods={foods} picked={new Map(picked.map((id) => [id, 1]))} wanted={wanted} onPick={toggle} />
      {meals.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Saved meals</h2>
          <div className="list">
            {meals.map((m) => (
              <ListRow
                key={m.id}
                title={m.name}
                subtitle={formatMacros(mealMacros(m, foods))}
                onClick={() => next([...pickedItems(), ...mealItems(m, foods)], m.id)}
              />
            ))}
          </div>
        </section>
      )}
      <button type="button" className="link" onClick={() => next([])}>
        Something not in My Diet
      </button>
      <div className="pick-bar">
        <Button
          title={chosen.length ? `Next · ${chosen.length} food${chosen.length === 1 ? '' : 's'}` : 'Tap foods to add them'}
          disabled={!chosen.length}
          onClick={() => next(pickedItems())}
        />
      </div>
    </Page>
  );
}

/** Confirm a new entry (from a photo or quick-add) or edit a logged one. */
/** `aiItems`: the photo analysis as returned, so corrections can be remembered (see diffCorrections). */
export function LogFormScreen(props: { log: FoodLog; isNew?: boolean; notice?: string; aiItems?: LogItem[] }) {
  const foods = useLive(() => listFoods(true), ['foods']); // old entries may use foods switched off since
  const meals = useLive(listMeals, ['meals', 'meal_items']);
  // Foods first: counted foods (eggs) start out shown in pieces.
  return foods && meals ? <LogForm {...props} foods={foods} meals={meals} /> : null;
}

function LogForm({ log, isNew, notice, aiItems, foods, meals }: {
  log: FoodLog; isNew?: boolean; notice?: string; aiItems?: LogItem[]; foods: Food[]; meals: Meal[];
}) {
  const nav = useNav();
  const { userId } = useAccount();
  const pieceOf = (item: LogItem) => foods.find((f) => f.id === item.foodId)?.pieceGrams;
  const [items, setItems] = useState(log.items.map((item) => ({ item, amount: showAmount(item.grams, pieceOf(item)) })));
  const [mealId, setMealId] = useState(log.mealId);
  const [name, setName] = useState(log.name ?? '');

  const rows = items.map((r) => {
    const g = toGrams(num(r.amount), pieceOf(r.item));
    return { ...r, piece: pieceOf(r.item), g, price: priceFor(r.item.foodId, g || 0, foods) };
  });
  const total = sumMacros(rows.map((r) => macrosFor(r.item.per100, r.g || 0)));
  const invalid =
    rows.length === 0 ? 'Add at least one item.' : rows.some((r) => !(r.g > 0 && r.g <= 5000)) ? 'Each amount must be 1–5000 g.' : null;
  const add = (more: LogItem[]) => setItems((list) => [...list, ...more.map((item) => ({ item, amount: showAmount(item.grams, pieceOf(item)) }))]);

  async function save() {
    await saveLog(userId, { ...log, mealId, name, items: rows.map((r) => ({ ...r.item, grams: r.g })) });
    if (aiItems) await saveCorrections(userId, log.id, diffCorrections(aiItems, rows.map((r) => ({ item: r.item, grams: r.g }))));
    nav.pop();
  }

  // A past entry eaten again: the same items as a new entry for now, opened so amounts can still be changed.
  function copyToToday() {
    const today = localDate();
    nav.replace(<LogFormScreen log={newLog(logTimeFor(today, today), { mealId, name, items: rows.map((r) => ({ ...r.item, grams: r.g })) })} isNew />);
  }

  // One-off items (scanned, AI estimates) aren't in My Diet, so a saved meal can't hold them.
  async function saveAsMeal() {
    const own = rows.filter((r) => r.item.foodId);
    if (own.length === 0) return alert("None of these items are in My Diet, so they can't make a saved meal.");
    const title = prompt('Name this meal', name.trim() || own.map((r) => r.item.name).join(' + '))?.trim();
    if (!title) return;
    const id = crypto.randomUUID();
    await saveMeal(userId, { id, name: title, photos: [], items: own.map((r) => ({ foodId: r.item.foodId!, grams: r.g })) });
    setMealId(id);
    alert(own.length < rows.length ? `Saved "${title}" to My Diet (one-off items left out).` : `Saved "${title}" to My Diet.`);
  }

  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  async function postToHabits() {
    setPosting(true);
    try {
      const title = name.trim() || meals.find((m) => m.id === mealId)?.name || rows.map((r) => r.item.name).join(', ');
      await postMealToHabits(log.photoPath!, mealTitle(title, total));
      setPosted(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPosting(false);
    }
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

      <Field label="Name" hint="Optional. Shown on the Food tab instead of the list of foods.">
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder={meals.find((m) => m.id === mealId)?.name ?? (rows.map((r) => r.item.name).join(', ') || 'e.g. Post-gym bowl')}
        />
      </Field>

      <section className="stack-sm">
        <SectionHead
          title="Items"
          action="+ Food"
          onAction={() =>
            nav.push(<FoodPickerScreen foods={foods.filter((f) => !f.disabled)} onPick={(f) => { add([fromFood(f, f.defaultGrams ?? f.pieceGrams ?? 100)]); nav.pop(); }} />)
          }
        />
        {rows.length === 0 && <EmptyState text="No items yet." />}
        {rows.map((r, i) => (
          <div key={i} className="log-item">
            <div className="meal-item">
              <span className="meal-item-name">{r.item.name}</span>
              <NumberInput
                label={`${r.item.name} amount`}
                value={r.amount}
                onChange={(amount) => setItems((list) => list.map((x, j) => (j === i ? { ...x, amount } : x)))}
                suffix={unitOf(r.piece)}
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
              {r.price !== null && ` · ${money(r.price)}`}
            </span>
          </div>
        ))}
        {canUseCamera && (
          <Button
            title="+ Scan a barcode"
            variant="secondary"
            onClick={async () => {
              const item = await scanItem(foods);
              if (item) add([item]);
            }}
          />
        )}
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
                    add(mealItems(m, foods));
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
      {log.photoPath && habitsLink() && (
        <Button title={posted ? 'Posted to RSHabits ✓' : 'Post to RSHabits'} variant="secondary" onClick={postToHabits} busy={posting} disabled={posted || !!invalid} />
      )}
      {isNew ? (
        !mealId && <Button title="Save as a meal" variant="secondary" onClick={saveAsMeal} disabled={!!invalid} />
      ) : (
        <div className="row">
          <Button title="Copy to today" variant="secondary" onClick={copyToToday} disabled={!!invalid} />
          <Button title="Save as a meal" variant="secondary" onClick={saveAsMeal} disabled={!!invalid} />
        </div>
      )}
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
