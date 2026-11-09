import { useEffect } from 'react';

import { setFoodPhoto, type Food } from '@/db/diet';
import { findMissingPhotos } from '@/lib/food-photo';
import { pairLinks } from '@/lib/pairs';
import { addPhoto, canUseCamera, photoSrc } from '@/lib/photos';
import { amountLabel } from '@/lib/nutrition';
import { money } from '@/lib/price';

const LINK = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1';
const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7';

/** Where most of a food's calories come from, to colour its card when it has no photo. */
const mainMacro = (f: Food) => {
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
                <span className="small muted">{Math.round(f.kcal)} kcal · {Math.round(f.protein)}P /100 g</span>
                {f.packGrams !== null && (
                  <span className="small muted">
                    {f.packPrice !== null && `${money(f.packPrice)} · `}{amountLabel(f.packGrams, f.pieceGrams)} pack
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
