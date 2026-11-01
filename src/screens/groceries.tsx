import { useEffect, useRef, useState } from 'react';

import { Button, EmptyState, NumberInput, num, Page } from '@/components/ui';
import { listFoods, restock, saveFood, type Food } from '@/db/diet';
import { useAccount } from '@/lib/account';
import { useNav } from '@/lib/nav';
import { formatMacros, per100From, showAmount, toGrams, unitOf, type Macros } from '@/lib/nutrition';
import { deletePhoto, photoBase64, photoSrc } from '@/lib/photos';
import { analyzeMeal } from '@/lib/supabase';

type Row = { on: boolean; amount: string; food: Food | null; name: string; per100: Macros | null };

/** Photo of your shopping → what's in it and how much, ready to add to At home. */
export function GroceryScanScreen({ photo }: { photo: string }) {
  const nav = useNav();
  const { userId } = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return; // StrictMode runs effects twice
    started.current = attempt;
    (async () => {
      try {
        // Switched-off foods are matched too: buying one switches it back on (see restock).
        const [foods, image] = await Promise.all([listFoods(true), photoBase64(photo)]);
        const ai = await analyzeMeal({
          kind: 'groceries', image, meals: [], notes: [], rules: [],
          foods: foods.map((f) => ({ id: f.id, name: f.name })),
        });
        setRows(
          ai.map((a) => {
            const food = foods.find((f) => f.id === a.foodId) ?? null;
            return { on: true, amount: showAmount(a.grams, food?.pieceGrams), food, name: food?.name ?? a.name, per100: food ? null : per100From(a) };
          }).filter((r) => r.food || r.per100),
        );
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [attempt]);

  const grams = (r: Row) => toGrams(num(r.amount), r.food?.pieceGrams);
  const chosen = (rows ?? []).filter((r) => r.on);
  const invalid = chosen.some((r) => !(grams(r) > 0 && grams(r) <= 20000)) ? 'Each amount must be more than 0 and at most 20000 g.' : null;

  async function add() {
    setBusy(true);
    try {
      await save();
      await deletePhoto(photo);
      nav.pop();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function save() {
    for (const r of chosen) {
      let id = r.food?.id;
      if (!id) {
        // Not in My Diet yet: added with the AI's estimate (marked as AI, editable in My Diet).
        id = crypto.randomUUID();
        await saveFood(userId, {
          id, name: r.name, ...r.per100!, defaultGrams: null, source: 'manual', sourceId: 'ai-groceries', barcode: null,
          shopUnit: null, shopQty: 0, atHome: true, homeGrams: null, pieceGrams: null, dailyMaxGrams: null, minGrams: null,
          pairsWith: [], disabled: false,
        });
      }
      await restock(id, grams(r));
    }
  }

  return (
    <Page title="Add groceries">
      <div className="thumb wide">
        <img src={photoSrc(photo)} alt="Your groceries" />
      </div>
      {!rows && !error && <p className="muted center">Looking at your shopping…</p>}
      {error && (
        <>
          <p className="danger">{error}</p>
          <Button title="Try again" onClick={() => { setError(null); setAttempt((n) => n + 1); }} />
        </>
      )}
      {rows && rows.length === 0 && <EmptyState text="No food recognised. Try a photo with everything clearly in view." />}
      {rows && rows.length > 0 && (
        <>
          <p className="muted">Check the amounts, untick anything wrong, then add them to At home.</p>
          <div className="list">
            {rows.map((r, i) => {
              const set = (patch: Partial<Row>) => setRows((list) => list!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="list-row home-row">
                  <label className="check-row">
                    <input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
                    <span>
                      <span className="list-title">{r.name}</span>
                      <span className="small muted">
                        {r.food
                          ? r.food.disabled ? 'In My Diet (switched off; this turns it back on)' : 'In My Diet'
                          : <><span className="tag">NEW</span>AI estimate · {formatMacros(r.per100!)} per 100 g</>}
                      </span>
                    </span>
                  </label>
                  <NumberInput label={`Amount of ${r.name}`} value={r.amount} onChange={(amount) => set({ amount })} suffix={unitOf(r.food?.pieceGrams)} />
                </div>
              );
            })}
          </div>
          {invalid && <p className="small muted">{invalid}</p>}
          <Button title={`Add ${chosen.length} to At home`} onClick={add} disabled={!!invalid || chosen.length === 0} busy={busy} />
        </>
      )}
    </Page>
  );
}
