import { useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { Button, EmptyState, ListRow, Screen } from '@/components/ui';
import { clearShopList, listFoods, listMeals, setShopQty } from '@/db/diet';
import { saveProfile, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { useNav } from '@/lib/nav';
import { useLive } from '@/lib/use-live';
import { supabase } from '@/lib/supabase';
import { applyTheme, getThemePref } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';
import { MyDietScreen } from '@/screens/diet';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function FoodScreen() {
  const { profile } = useAccount();
  const nav = useNav();
  const counts = useLive(
    async () => ({ foods: (await listFoods()).length, meals: (await listMeals()).length }),
    ['foods', 'meals'],
  );
  const t = profile && targetsFor(profile);
  return (
    <Screen title="Today">
      <div className="list">
        <ListRow
          title="My Diet"
          subtitle={counts && `${plural(counts.foods, 'food')} · ${plural(counts.meals, 'meal')}`}
          onClick={() => nav.push(<MyDietScreen />)}
        />
      </div>
      {t && (
        <div className="card">
          <h2>{t.kcal} kcal</h2>
          <div className="row">
            <Macro label="Protein" grams={t.protein} />
            <Macro label="Carbs" grams={t.carbs} />
            <Macro label="Fat" grams={t.fat} />
          </div>
        </div>
      )}
      <EmptyState text="No food logged yet." />
    </Screen>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <div>
      <strong className="small">{grams} g</strong>
      <div className="small muted">{label}</div>
    </div>
  );
}

export function GymScreen() {
  return (
    <Screen title="Gym">
      <EmptyState text="No templates yet." />
    </Screen>
  );
}

export function ShopScreen() {
  const foods = useLive(listFoods, ['foods']);
  if (!foods) return null;
  return (
    <Screen title="Shopping list">
      {foods.length === 0 && <EmptyState text="Add foods in My Diet (Food tab) to build your list." />}
      <div className="list">
        {foods.map((f) => (
          <div key={f.id} className={f.shopQty > 0 ? 'shop-row active' : 'shop-row'}>
            <span>
              <span className="list-title">{f.name}</span>
              {f.shopUnit && <span className="small muted">{f.shopUnit}</span>}
            </span>
            <span className="stepper">
              <button
                type="button"
                aria-label={`One less ${f.name}`}
                disabled={f.shopQty === 0}
                onClick={() => setShopQty(f.id, f.shopQty - 1)}>
                −
              </button>
              <span aria-live="polite">{f.shopQty}</span>
              <button type="button" aria-label={`One more ${f.name}`} onClick={() => setShopQty(f.id, f.shopQty + 1)}>
                +
              </button>
            </span>
          </div>
        ))}
      </div>
      {foods.some((f) => f.shopQty > 0) && (
        <Button title="Clear list" variant="secondary" onClick={() => confirm('Clear the shopping list?') && clearShopList()} />
      )}
    </Screen>
  );
}

export function ProfileScreen() {
  const { userId, email, profile } = useAccount();
  const [light, setLight] = useState(getThemePref() === 'light');
  return (
    <Screen title="Profile">
      <p className="muted">{email}</p>
      <label className="card toggle">
        Light mode
        <input
          type="checkbox"
          role="switch"
          checked={light}
          onChange={(e) => {
            setLight(e.target.checked);
            applyTheme(e.target.checked ? 'light' : 'dark');
          }}
        />
      </label>
      <ProfileForm
        initial={profile}
        submitLabel="Save"
        onSubmit={async (p) => {
          await saveProfile(userId, p, profile?.weightKg);
          alert('Saved');
        }}
      />
      <Button title="Sign out" variant="secondary" onClick={() => supabase.auth.signOut()} />
      <p className="small muted center">Version {BUNDLE}</p>
    </Screen>
  );
}
