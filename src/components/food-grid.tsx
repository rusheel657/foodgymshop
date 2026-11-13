import { useEffect, type ReactNode } from 'react';

import { setFoodPhoto, type Food } from '@/db/diet';
import { findMissingPhotos } from '@/lib/food-photo';
import { pairLinks } from '@/lib/pairs';
import { addPhoto, canUseCamera, photoSrc } from '@/lib/photos';
import { amountLabel } from '@/lib/nutrition';
import { money } from '@/lib/price';

const LINK = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1';
const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7';

/** Where most of a food's calories come from, to colour its card when it has no photo. */
export const mainMacro = (f: Food) => {
  const kcal = { protein: f.protein * 4, carbs: f.carbs * 4, fat: f.fat * 9 };
  return (Object.keys(kcal) as (keyof typeof kcal)[]).reduce((a, b) => (kcal[b] > kcal[a] ? b : a));
};

const names = (foods: Food[]) => foods.map((f) => f.name).join(' + ');

/** Takes a photo for a food's card; cancelling does nothing. */
export async function photographFood(food: Food) {
  try {
    const uri = await addPhoto('camera');
    if (uri) await setFoodPhoto(food.id, uri);
  } catch (e) {
    if (!/cancel/i.test((e as Error).message)) alert((e as Error).message);
  }
}

/** Two-column cards: the food's photo (or a plain card with a camera button), and its links to other foods.
 *  `links`: all foods, so links to foods outside `foods` still show. */
export function FoodGrid({ foods, links = foods, picked, wanted, onPick }: {
  foods: Food[];
  links?: Food[];
  picked?: Map<string, number>; // food id → how many times it's picked
  wanted?: Set<string>; // foods a picked food needs
  onPick: (food: Food) => void;
}) {
  const pairs = pairLinks(links);
  const missing = foods.filter((f) => !f.photo).map((f) => f.id).join();
  useEffect(() => {
    if (missing) void findMissingPhotos(foods);
  }, [missing]);
  return (
    <div className="food-grid">
      {foods.map((f) => {
        const needs = pairs.needs(f.id);
        const neededBy = pairs.neededBy(f.id);
        const count = picked?.get(f.id) ?? 0;
        return (
          <div key={f.id} className={`food-card${count ? ' picked' : ''}${wanted?.has(f.id) ? ' wanted' : ''}`}>
            <button type="button" className="food-card-main" aria-pressed={picked ? count > 0 : undefined} onClick={() => onPick(f)}>
              {f.photo ? (
                <img className="food-card-photo" src={photoSrc(f.photo)} alt="" />
              ) : (
                <span className={`food-card-photo empty ${mainMacro(f)}`} aria-hidden="true">
                  {f.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="food-card-body">
                <span className="food-card-name">{f.name}</span>
                <span className="small muted">{Math.round(f.kcal)} kcal · {Math.round(f.protein)}P /100 {f.liquid ? 'ml' : 'g'}</span>
                {f.packGrams !== null && (
                  <span className="small muted">
                    {f.packPrice !== null && `${money(f.packPrice)} · `}{amountLabel(f.packGrams, f.pieceGrams, f.liquid)} pack
                  </span>
                )}
                {needs.length > 0 && (
                  <span className="link-chip needs">
                    <LinkIcon /> With {names(needs)}
                  </span>
                )}
                {neededBy.length > 0 && (
                  <span className="link-chip goes">
                    <LinkIcon /> Goes with {names(neededBy)}
                  </span>
                )}
              </span>
              {count > 0 && <span className="food-card-check">{count > 1 ? `×${count}` : '✓'}</span>}
            </button>
            {!f.photo && canUseCamera && (
              <button type="button" className="food-card-camera" aria-label={`Take a photo of ${f.name}`} onClick={() => photographFood(f)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={CAMERA} />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={LINK} />
    </svg>
  );
}

// Small filled glyphs (24×24) for the cards.
export const ICONS = {
  flame: 'M12 2.5c.8 3.2 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-4.8.1 1.8 1 3 2.3 3.3-.6-3.4-.3-6.3.3-9z',
  protein: 'M15.5 3a5.5 5.5 0 0 1 .9 10.9l-2.6.4-4.2 4.2a2.3 2.3 0 1 1-3.4 2.6 2.3 2.3 0 1 1 2.6-3.4l4.2-4.2.4-2.6A5.5 5.5 0 0 1 15.5 3z',
  carbs: 'M11 21V11.5C8.6 11 7 9 7 6.5c2.4.3 4 2 4 4.6V9.6C8.8 9 7.4 7.1 7.6 4.8 9.8 5.2 11 7 11 9.3V3h2v6.3c0-2.3 1.2-4.1 3.4-4.5.2 2.3-1.2 4.2-3.4 4.8v1.5c0-2.6 1.6-4.3 4-4.6 0 2.5-1.6 4.5-4 5V21z',
  fat: 'M12 2.8s6.5 7.2 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 10 12 2.8 12 2.8z',
};

export function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'glyph'} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** A food or meal as a row in a card, the way Today's food shows it: photo (or the first letter, coloured by its main
 *  macro), name, calories and protein / carbs / fat. `side`: top-right text (a time); `extra`: after the calories. */
export function EntryRow({ photo, letter, tone, title, side, m, extra, picked, onClick }: {
  photo?: string | null; letter: string; tone: string; title: string; side?: ReactNode;
  m: { kcal: number; protein: number; carbs: number; fat: number }; extra?: ReactNode; picked?: number; onClick: () => void;
}) {
  const r = Math.round;
  return (
    <button type="button" className={picked ? 'entry picked' : 'entry'} aria-pressed={picked === undefined ? undefined : picked > 0} onClick={onClick}>
      <span className="entry-photo-wrap">
        {photo ? <img className="entry-photo" src={photoSrc(photo)} alt="" /> : <span className={`entry-photo empty ${tone}`} aria-hidden="true">{letter.slice(0, 1).toUpperCase()}</span>}
        {!!picked && <span className="food-card-check">{picked > 1 ? `×${picked}` : '✓'}</span>}
      </span>
      <span className="entry-body">
        <span className="entry-top">
          <span className="entry-name">{title}</span>
          {side && <span className="small muted">{side}</span>}
        </span>
        <span className="entry-kcal">
          <Glyph d={ICONS.flame} />
          {r(m.kcal)} calories
          {extra}
        </span>
        <span className="entry-macros small">
          <span className="protein"><Glyph d={ICONS.protein} />{r(m.protein)}g</span>
          <span className="carbs"><Glyph d={ICONS.carbs} />{r(m.carbs)}g</span>
          <span className="fat"><Glyph d={ICONS.fat} />{r(m.fat)}g</span>
        </span>
      </span>
    </button>
  );
}
