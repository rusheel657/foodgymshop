import { useEffect, useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { Button, EmptyState, ListRow, Page, Screen, Segmented, TextInput } from '@/components/ui';
import { clearShopList, listFoods, setShopQty } from '@/db/diet';
import { saveProfile } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { connectHealth, healthStatus } from '@/lib/health';
import { connectHabits, disconnectHabits, habitsLink } from '@/lib/rshabits';
import { useLive } from '@/lib/use-live';
import { supabase } from '@/lib/supabase';
import { useNav } from '@/lib/nav';
import { animate } from '@/lib/motion';
import { amountLabel } from '@/lib/nutrition';
import { applyTheme, getThemePref } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';
import { SmartList } from '@/screens/shop';
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
              {f.packGrams !== null && <span className="small muted">{amountLabel(f.packGrams, f.pieceGrams)} pack</span>}
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

const GOAL = { lose: 'Lose', gain: 'Gain', maintain: 'Keep' } as const;

/** Settings, grouped: you, appearance, connections, account. */
export function ProfileScreen() {
  const { email, profile } = useAccount();
  const nav = useNav();
  const [theme, setTheme] = useState(getThemePref);
  return (
    <Screen title="Profile">
      <section className="settings-group">
        <h2 className="section-title">You</h2>
        <div className="list">
          <ListRow
            title="Body & goal"
            subtitle={profile ? `${GOAL[profile.goal]} weight${profile.goal === 'maintain' ? '' : ` · ${profile.rateKgWeek} kg a week`}` : 'Set up'}
            onClick={() => nav.push(<BodyGoalScreen />)}
          />
          <ListRow title="Weight" subtitle={profile ? `${profile.weightKg} kg · log and track` : 'Log and track'} onClick={() => nav.push(<WeightScreen />)} />
        </div>
      </section>

      <section className="settings-group">
        <h2 className="section-title">Appearance</h2>
        <Segmented
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] as const}
          value={theme}
          onChange={(t) => animate('fade', () => { setTheme(t); applyTheme(t); })}
        />
      </section>

      <section className="settings-group">
        <h2 className="section-title">Connections</h2>
        <HealthCard />
        <HabitsCard />
      </section>

      <section className="settings-group">
        <h2 className="section-title">Account</h2>
        <div className="list">
          <div className="list-row">
            <span>
              <span className="list-title">Signed in</span>
              <span className="small muted">{email}</span>
            </span>
          </div>
          <button type="button" className="list-row danger" onClick={() => confirm('Sign out?') && supabase.auth.signOut()}>
            <span className="list-title">Sign out</span>
          </button>
        </div>
      </section>
      <footer className="app-footer">
        <img src="/icon.png" alt="" width={44} height={44} />
        <strong>RSFitness</strong>
        <span className="small muted">Version {BUNDLE}</span>
      </footer>
    </Screen>
  );
}

function BodyGoalScreen() {
  const { userId, profile } = useAccount();
  const nav = useNav();
  return (
    <Page title="Body & goal">
      <ProfileForm
        initial={profile}
        submitLabel="Save"
        onSubmit={async (p) => {
          await saveProfile(userId, p, profile?.weightKg);
          nav.pop();
        }}
      />
    </Page>
  );
}

/** RSHabits: paste the code from RSHabits (You → Health → RSFitness) once. */
function HabitsCard() {
  const [link, setLink] = useState(habitsLink);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      await connectHabits(code);
      setLink(habitsLink());
      setCode('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card stack-sm">
      <strong>RSHabits {link && <span className="chip">Connected</span>}</strong>
      <p className="small muted">
        {link
          ? `Linked${link.name ? ` to ${link.name}` : ''}. Logging your weight ticks habits like “Weigh myself”, and photo meals can be posted to your RSHabits Meals photos.`
          : 'Logging your weight ticks habits like “Weigh myself” in RSHabits, and photo meals can be posted there with their macros. In RSHabits, open You → Health → RSFitness → Connect, copy the code and paste it here.'}
      </p>
      {link ? (
        <Button title="Disconnect" variant="secondary" onClick={() => confirm('Disconnect RSHabits?') && (disconnectHabits(), setLink(null))} />
      ) : (
        <>
          <TextInput label="RSHabits code" value={code} onChange={setCode} placeholder="rsf_…" />
          <Button title="Connect" onClick={connect} busy={busy} disabled={!code.trim()} />
        </>
      )}
    </div>
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
