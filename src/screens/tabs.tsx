import { useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { useSkin } from '@/components/effects';
import { Button, EmptyState, ListRow, Screen } from '@/components/ui';
import { clearShopList, listFoods, setShopQty } from '@/db/diet';
import { saveProfile } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { useLive } from '@/lib/use-live';
import { supabase } from '@/lib/supabase';
import { useNav } from '@/lib/nav';
import { applyTheme, getThemePref, isSpecial, SKINS } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';
import { ThemesScreen } from '@/screens/themes';

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
  const nav = useNav();
  const skin = useSkin();
  const [light, setLight] = useState(getThemePref() === 'light');
  return (
    <Screen title="Profile">
      <p className="muted">{email}</p>
      <div className="list">
        <ListRow title="Themes" subtitle={SKINS[skin].name} onClick={() => nav.push(<ThemesScreen />)} />
      </div>
      <label className={isSpecial(skin) ? 'card toggle disabled' : 'card toggle'}>
        <span>
          Light mode
          {isSpecial(skin) && <span className="small muted block">Set by the {SKINS[skin].name} theme</span>}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={light}
          disabled={isSpecial(skin)}
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
