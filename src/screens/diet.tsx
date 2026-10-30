import { useState } from 'react';

import { Button, EmptyState, Field, ListRow, NumberInput, num, Page, SectionHead, TextInput } from '@/components/ui';
import {
  deleteFood, deleteMeal, listFoods, listMeals, mealMacros, saveFood, saveMeal, type Food, type Meal,
} from '@/db/diet';
import { useAccount } from '@/lib/account';
import { lookupBarcode, scanBarcode, searchOff } from '@/lib/barcode';
import { useNav } from '@/lib/nav';
import { formatMacros, macrosFor, showAmount, sumMacros, toGrams, unitOf, type FoodDraft } from '@/lib/nutrition';
import { addPhoto, canUseCamera, deletePhoto, photoSrc } from '@/lib/photos';
import { searchUsda, type UsdaFood } from '@/lib/supabase';
import { useLive } from '@/lib/use-live';

const MAX_PHOTOS = 2;

const newFood = (patch: Partial<Food>): Food => ({
  id: crypto.randomUUID(), name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, defaultGrams: null,
  source: 'manual', sourceId: null, barcode: null, shopUnit: null, shopQty: 0, atHome: false, homeGrams: null, pieceGrams: null, dailyMaxGrams: null, ...patch,
});

export function MyDietScreen() {
  const nav = useNav();
  const foods = useLive(listFoods, ['foods']);
  const meals = useLive(listMeals, ['meals', 'meal_items']);
  if (!foods || !meals) return null;
  return (
    <Page title="My Diet">
      <section className="stack-sm">
        <SectionHead title="Foods" action="+ Add" onAction={() => nav.push(<AddFoodScreen />)} />
        {foods.length === 0 && <EmptyState text="Add the foods you eat regularly." />}
        <div className="list">
          {foods.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              subtitle={`100 g · ${formatMacros(f)}`}
              onClick={() => nav.push(<FoodFormScreen food={f} />)}
            />
          ))}
        </div>
      </section>
      <section className="stack-sm">
        <SectionHead
          title="Meals"
          action="+ New"
          onAction={() => nav.push(<MealFormScreen meal={{ id: crypto.randomUUID(), name: '', photos: [], items: [] }} isNew />)}
        />
        {meals.length === 0 && <EmptyState text='Save fixed meals, e.g. "500 g lamb + 4 eggs".' />}
        <div className="list">
          {meals.map((m) => (
            <ListRow
              key={m.id}
              title={m.name}
              subtitle={formatMacros(mealMacros(m, foods))}
              onClick={() => nav.push(<MealFormScreen meal={m} />)}
            />
          ))}
        </div>
      </section>
    </Page>
  );
}

function AddFoodScreen() {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ off: FoodDraft[]; usda: UsdaFood[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Both sources at once; one failing still shows the other's results.
  const search = () =>
    attempt(async () => {
      const q = query.trim();
      const [off, usda] = await Promise.allSettled([searchOff(q), searchUsda(q)]);
      setResults({ off: off.status === 'fulfilled' ? off.value : [], usda: usda.status === 'fulfilled' ? usda.value : [] });
      const failed = [off, usda].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) setError(failed.map((r) => (r.reason as Error).message).join(' · '));
    });

  const scan = () =>
    attempt(async () => {
      const code = await scanBarcode();
      if (!code) return;
      const found = await lookupBarcode(code);
      nav.push(
        <FoodFormScreen
          food={newFood(found ? { ...found, source: 'off', sourceId: code } : { barcode: code })}
          isNew
          popCount={2}
          notice={found ? undefined : `Barcode ${code} isn't in Open Food Facts. Enter it from the label.`}
        />,
      );
    });

  return (
    <Page title="Add food">
      <form
        className="row search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search();
        }}>
        <TextInput label="Search foods" value={query} onChange={setQuery} placeholder="e.g. lamb mince 20% sainsburys" />
        <button type="submit" className="button primary small" disabled={busy || !query.trim()}>
          Search
        </button>
      </form>
      <div className="row">
        {canUseCamera && <Button title="Scan barcode" variant="secondary" onClick={scan} busy={busy} />}
        <Button
          title="Enter manually"
          variant="secondary"
          onClick={() => nav.push(<FoodFormScreen food={newFood({})} isNew popCount={2} />)}
        />
      </div>
      {error && <p className="small danger">{error}</p>}
      {results && results.off.length + results.usda.length === 0 && <EmptyState text="No matches." />}
      {!!results?.off.length && (
        <section className="stack-sm">
          <h2 className="label">Products · Open Food Facts</h2>
          <div className="list">
            {results.off.map((r) => (
              <ListRow
                key={r.barcode}
                title={r.name}
                subtitle={`100 g · ${formatMacros(r)}`}
                onClick={() =>
                  nav.push(<FoodFormScreen food={newFood({ ...r, source: 'off', sourceId: r.barcode })} isNew popCount={2} />)
                }
              />
            ))}
          </div>
        </section>
      )}
      {!!results?.usda.length && (
        <section className="stack-sm">
          <h2 className="label">Generic · USDA</h2>
          <div className="list">
            {results.usda.map((r) => (
              <ListRow
                key={r.id}
                title={r.name}
                subtitle={`100 g · ${formatMacros(r)}`}
                onClick={() =>
                  nav.push(
                    <FoodFormScreen
                      food={newFood({ name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, source: 'usda', sourceId: r.id })}
                      isNew
                      popCount={2}
                    />,
                  )
                }
              />
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

const str = (n: number | null) => (n == null ? '' : String(n));
const SOURCE = { usda: 'USDA FoodData Central', off: 'Open Food Facts', manual: 'Entered manually' };

function FoodFormScreen({ food, isNew, popCount = 1, notice }: {
  food: Food;
  isNew?: boolean;
  popCount?: number;
  notice?: string;
}) {
  const nav = useNav();
  const { userId } = useAccount();
  const [d, setD] = useState({
    name: food.name,
    kcal: isNew && !food.name ? '' : str(food.kcal),
    protein: isNew && !food.name ? '' : str(food.protein),
    carbs: isNew && !food.name ? '' : str(food.carbs),
    fat: isNew && !food.name ? '' : str(food.fat),
    defaultGrams: str(food.defaultGrams),
    shopUnit: food.shopUnit ?? '',
    pieceGrams: str(food.pieceGrams),
    dailyMax: food.dailyMaxGrams === null ? '' : showAmount(food.dailyMaxGrams, food.pieceGrams),
  });
  const set = (patch: Partial<typeof d>) => setD((prev) => ({ ...prev, ...patch }));

  const macros = { kcal: num(d.kcal), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat) };
  const grams = d.defaultGrams.trim() === '' ? null : num(d.defaultGrams);
  const piece = d.pieceGrams.trim() === '' ? null : num(d.pieceGrams);
  const limit = d.dailyMax.trim() === '' ? null : toGrams(num(d.dailyMax), piece);
  const error = !d.name.trim()
    ? 'Give it a name.'
    : !(macros.kcal >= 0 && macros.kcal <= 900)
      ? 'Calories per 100 g must be 0–900.'
      : ![macros.protein, macros.carbs, macros.fat].every((g) => g >= 0 && g <= 100)
        ? 'Protein, carbs and fat must each be 0–100 g.'
        : macros.protein + macros.carbs + macros.fat > 101
          ? 'Protein + carbs + fat can’t exceed 100 g per 100 g.'
          : grams !== null && !(grams > 0 && grams <= 5000)
            ? 'Usual portion must be 1–5000 g.'
            : piece !== null && !(piece > 0 && piece <= 1000)
              ? 'One piece must weigh 1–1000 g.'
              : limit !== null && !(limit > 0 && limit <= 5000)
                ? 'Daily limit must be more than 0 and at most 5000 g.'
                : null;

  async function save() {
    await saveFood(userId, {
      ...food, ...macros, name: d.name.trim(), defaultGrams: grams, shopUnit: d.shopUnit.trim() || null,
      pieceGrams: piece, dailyMaxGrams: limit,
    });
    nav.pop(popCount);
  }

  async function remove() {
    if (!confirm(`Delete ${food.name}? It will also be removed from your meals.`)) return;
    await deleteFood(food.id);
    nav.pop();
  }

  return (
    <Page title={isNew ? 'New food' : 'Edit food'}>
      {notice && <p className="small muted">{notice}</p>}
      <Field label="Name">
        <TextInput label="Name" value={d.name} onChange={(name) => set({ name })} placeholder="e.g. Lamb mince" />
      </Field>
      <Field label="Per 100 g">
        <div className="grid-2">
          <NumberInput label="Calories" value={d.kcal} onChange={(kcal) => set({ kcal })} suffix="kcal" />
          <NumberInput label="Protein" value={d.protein} onChange={(protein) => set({ protein })} suffix="g P" />
          <NumberInput label="Carbs" value={d.carbs} onChange={(carbs) => set({ carbs })} suffix="g C" />
          <NumberInput label="Fat" value={d.fat} onChange={(fat) => set({ fat })} suffix="g F" />
        </div>
      </Field>
      <Field label="Usual portion" hint="Optional. Used when you add this food to a meal.">
        <NumberInput label="Usual portion" value={d.defaultGrams} onChange={(defaultGrams) => set({ defaultGrams })} suffix="g" />
      </Field>
      <Field label="Counted in pieces" hint="Optional. Weight of one piece, e.g. 50 g for an egg, 24 g for a Medjool date. You then log it as a number of pieces.">
        <NumberInput label="Grams per piece" value={d.pieceGrams} onChange={(pieceGrams) => set({ pieceGrams })} suffix="g each" />
      </Field>
      <Field label="Daily limit" hint="Optional. The most you want in a day; What should I eat? never goes over it.">
        <NumberInput label="Daily limit" value={d.dailyMax} onChange={(dailyMax) => set({ dailyMax })} suffix={piece ? 'pcs a day' : 'g a day'} placeholder="none" />
      </Field>
      <Field label="Shopping unit" hint="Optional, e.g. pack, kg, dozen.">
        <TextInput label="Shopping unit" value={d.shopUnit} onChange={(shopUnit) => set({ shopUnit })} />
      </Field>
      <p className="small muted">
        {SOURCE[food.source]}
        {food.barcode && ` · barcode ${food.barcode}`}
      </p>
      {error && <p className="small muted">{error}</p>}
      <Button title="Save" onClick={save} disabled={!!error} />
      {!isNew && <Button title="Delete food" variant="secondary" onClick={remove} />}
    </Page>
  );
}

function MealFormScreen(props: { meal: Meal; isNew?: boolean }) {
  const foods = useLive(listFoods, ['foods']);
  // Foods first: counted foods (eggs) start out shown in pieces.
  return foods ? <MealForm {...props} foods={foods} /> : null;
}

function MealForm({ meal, isNew, foods }: { meal: Meal; isNew?: boolean; foods: Food[] }) {
  const nav = useNav();
  const { userId } = useAccount();
  const pieceOf = (foodId: string) => foods.find((f) => f.id === foodId)?.pieceGrams;
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState(meal.items.map((i) => ({ foodId: i.foodId, amount: showAmount(i.grams, pieceOf(i.foodId)) })));
  const [photos, setPhotos] = useState(meal.photos);
  const [error, setError] = useState<string | null>(null);

  // `idx` = position in `items` (rows whose food was deleted are hidden, so positions differ).
  const live = items
    .map((i, idx) => ({ ...i, idx, g: toGrams(num(i.amount), pieceOf(i.foodId)) }))
    .filter((i) => foods.some((f) => f.id === i.foodId));
  const total = sumMacros(live.map((i) => macrosFor(foods.find((f) => f.id === i.foodId)!, i.g || 0)));
  const invalid = !name.trim()
    ? 'Give the meal a name.'
    : live.length === 0
      ? 'Add at least one food.'
      : live.some((i) => !(i.g > 0 && i.g <= 5000))
        ? 'Each amount must be 1–5000 g.'
        : null;

  async function save() {
    await saveMeal(userId, { id: meal.id, name: name.trim(), photos, items: live.map((i) => ({ foodId: i.foodId, grams: i.g })) });
    // shortcut: photos added and then abandoned (back without saving) stay on disk; clean up in Phase 6 export/cleanup.
    await Promise.all(meal.photos.filter((p) => !photos.includes(p)).map(deletePhoto));
    nav.pop();
  }

  async function remove() {
    if (!confirm(`Delete ${meal.name}?`)) return;
    await deleteMeal(meal.id);
    await Promise.all(meal.photos.map(deletePhoto));
    nav.pop();
  }

  async function takePhoto(from: 'camera' | 'gallery') {
    setError(null);
    try {
      const uri = await addPhoto(from);
      if (uri) setPhotos((p) => [...p, uri].slice(0, MAX_PHOTOS));
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) setError((e as Error).message);
    }
  }

  return (
    <Page title={isNew ? 'New meal' : 'Edit meal'}>
      <Field label="Name">
        <TextInput label="Meal name" value={name} onChange={setName} placeholder="e.g. Lamb & eggs" />
      </Field>

      <section className="stack-sm">
        <SectionHead
          title="Foods"
          action="+ Add"
          onAction={() =>
            nav.push(
              <FoodPickerScreen
                foods={foods}
                onPick={(f) => {
                  setItems((list) => [...list, { foodId: f.id, amount: showAmount(f.defaultGrams ?? f.pieceGrams ?? 100, f.pieceGrams) }]);
                  nav.pop();
                }}
              />,
            )
          }
        />
        {live.length === 0 && <EmptyState text="No foods yet." />}
        {live.map((item, i) => {
          const food = foods.find((f) => f.id === item.foodId)!;
          return (
            <div key={i} className="meal-item">
              <span className="meal-item-name">{food.name}</span>
              <NumberInput
                label={`${food.name} amount`}
                value={item.amount}
                onChange={(amount) => setItems((list) => list.map((x, j) => (j === item.idx ? { ...x, amount } : x)))}
                suffix={unitOf(food.pieceGrams)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${food.name}`}
                onClick={() => setItems((list) => list.filter((_, j) => j !== item.idx))}>
                ×
              </button>
            </div>
          );
        })}
      </section>

      <div className="card">
        <h2>{Math.round(total.kcal)} kcal</h2>
        <p className="muted">
          P {Math.round(total.protein)} g · C {Math.round(total.carbs)} g · F {Math.round(total.fat)} g
        </p>
      </div>

      <Field label="Reference photos" hint="Up to 2. Helps the AI recognise this meal later.">
        <div className="thumbs">
          {photos.map((p) => (
            <div key={p} className="thumb">
              <img src={photoSrc(p)} alt="Meal reference" />
              <button
                type="button"
                className="icon-button"
                aria-label="Remove photo"
                onClick={() => setPhotos((list) => list.filter((x) => x !== p))}>
                ×
              </button>
            </div>
          ))}
        </div>
        {photos.length < MAX_PHOTOS &&
          (canUseCamera ? (
            <div className="row">
              <Button title="Take photo" variant="secondary" onClick={() => takePhoto('camera')} />
              <Button title="From gallery" variant="secondary" onClick={() => takePhoto('gallery')} />
            </div>
          ) : (
            <span className="small muted">Photos work in the Android app.</span>
          ))}
      </Field>

      {error && <p className="small danger">{error}</p>}
      {invalid && <p className="small muted">{invalid}</p>}
      <Button title="Save" onClick={save} disabled={!!invalid} />
      {!isNew && <Button title="Delete meal" variant="secondary" onClick={remove} />}
    </Page>
  );
}

export function FoodPickerScreen({ foods, onPick }: { foods: Food[]; onPick: (food: Food) => void }) {
  return (
    <Page title="Choose food">
      {foods.length === 0 && <EmptyState text="Add foods in My Diet first." />}
      <div className="list">
        {foods.map((f) => (
          <ListRow key={f.id} title={f.name} subtitle={`100 g · ${formatMacros(f)}`} onClick={() => onPick(f)} />
        ))}
      </div>
    </Page>
  );
}
