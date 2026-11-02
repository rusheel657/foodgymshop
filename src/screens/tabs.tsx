import { useEffect, useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { useSkin } from '@/components/effects';
import { Button, EmptyState, ListRow, Screen } from '@/components/ui';
import { clearShopList, listFoods, setShopQty } from '@/db/diet';
import { saveProfile } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { connectHealth, healthStatus } from '@/lib/health';
import { useLive } from '@/lib/use-live';
import { supabase } from '@/lib/supabase';
import { useNav } from '@/lib/nav';
import { applyTheme, getThemePref, isSpecial, SKINS } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';
import { SmartList } from '@/screens/shop';
import { ThemesScreen } from '@/screens/themes';
import { WeightScreen } from '@/screens/weight';

export function ShopScreen() {
  const foods = useLive(listFoods, ['foods']);
  if (!foods) return null;
  return (
    <Screen title="Shopping list">
      <SmartList />
      <h2 className="buy-title">My list</h2>
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
        <ListRow title="Weight" subtitle={profile ? `${profile.weightKg} kg · log and track` : 'Log and track'} onClick={() => nav.push(<WeightScreen />)} />
        <ListRow title="Themes" subtitle={SKINS[skin].name} onClick={() => nav.push(<ThemesScreen />)} />
      </div>
      <HealthCard />
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

/** Health Connect: steps make each day's calorie target follow what you actually did. */
function HealthCard() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof healthStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void healthStatus().then(setStatus);
  }, []);
  if (!status) return null;
  async function connect() {
    setBusy(true);
    try {
      await connectHealth();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setStatus(await healthStatus());
      setBusy(false);
    }
  }
  return (
    <div className="card stack-sm">
      <strong>Health Connect {status === 'on' && <span className="chip">Connected</span>}</strong>
      <p className="small muted">
        {status === 'unavailable'
          ? 'Health Connect isn’t available here. On Android 13 or older, install “Health Connect” from the Play Store.'
          : status === 'on'
            ? 'Your calorie target follows your steps and the workouts you log here. On days without step data, it uses your activity level below.'
            : 'Connect to read your steps. Each day’s calorie target then comes from what you actually burn (steps + workouts logged here) instead of a fixed activity level.'}
      </p>
      {status === 'off' && <Button title="Connect" onClick={connect} busy={busy} />}
    </div>
  );
}
