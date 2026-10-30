import { useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { Button, EmptyState, ListRow, Screen } from '@/components/ui';
import { clearShopList, listFoods, listMeals, setShopQty } from '@/db/diet';
import { listLogs, logTimeFor } from '@/db/log';
import { localDate, saveProfile, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { useNav } from '@/lib/nav';
import { macrosFor, sumMacros } from '@/lib/nutrition';
import { addPhoto, canUseCamera } from '@/lib/photos';
import { useLive } from '@/lib/use-live';
import { supabase } from '@/lib/supabase';
import { applyTheme, getThemePref } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';
import { MyDietScreen } from '@/screens/diet';
import { HistoryScreen } from '@/screens/history';
import { AtHomeScreen, SuggestScreen } from '@/screens/home';
import { AnalyzeScreen, LogFormScreen, newLog } from '@/screens/log';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function FoodScreen() {
  const { profile } = useAccount();
  const nav = useNav();
  const today = localDate();
  const [date, setDate] = useState(today);
  const counts = useLive(async () => {
    const foods = await listFoods();
    return { foods: foods.length, home: foods.filter((f) => f.atHome).length, meals: (await listMeals()).length };
  }, ['foods', 'meals']);
  const logs = useLive(() => listLogs(date), ['food_logs', 'food_log_items'], [date]);
  const t = profile && targetsFor(profile);
  const eaten = sumMacros((logs ?? []).flatMap((l) => l.items.map((i) => macrosFor(i.per100, i.grams))));

  async function photo(from: 'camera' | 'gallery') {
    if (!navigator.onLine) return alert('No connection. Use Quick add instead.');
    try {
      const uri = await addPhoto(from);
      if (uri) nav.push(<AnalyzeScreen photo={uri} loggedAt={logTimeFor(date, today)} />);
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) alert((e as Error).message);
    }
  }

  return (
    <Screen
      title={
        <span className="date-nav">
          <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
            ‹
          </button>
          {dayLabel(date, today)}
          <button
            type="button"
            className="icon-button"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(shiftDate(date, 1))}>
            ›
          </button>
        </span>
      }>
      {t && (
        <div className="card">
          <div className="kcal">
            <Ring value={eaten.kcal} max={t.kcal} />
            <div>
              <h2>{Math.round(eaten.kcal)} kcal</h2>
              <p className="small muted">
                of {t.kcal} · {Math.max(0, Math.round(t.kcal - eaten.kcal))} left
              </p>
            </div>
          </div>
          <Bar label="Protein" value={eaten.protein} max={t.protein} />
          <Bar label="Carbs" value={eaten.carbs} max={t.carbs} />
          <Bar label="Fat" value={eaten.fat} max={t.fat} />
        </div>
      )}

      <div className="row">
        {canUseCamera && <Button title="Photo" onClick={() => photo('camera')} />}
        {canUseCamera && <Button title="Gallery" variant="secondary" onClick={() => photo('gallery')} />}
        <Button
          title="Quick add"
          variant={canUseCamera ? 'secondary' : 'primary'}
          onClick={() => nav.push(<LogFormScreen log={newLog(logTimeFor(date, today))} isNew />)}
        />
      </div>

      {t && (
        <Button
          title="What should I eat?"
          variant="secondary"
          onClick={() =>
            nav.push(
              <SuggestScreen
                remaining={{ kcal: t.kcal - eaten.kcal, protein: t.protein - eaten.protein, carbs: t.carbs - eaten.carbs, fat: t.fat - eaten.fat }}
                loggedAt={logTimeFor(date, today)}
              />,
            )
          }
        />
      )}

      {logs?.length === 0 && <EmptyState text="No food logged." />}
      <div className="list">
        {logs?.map((l) => {
          const m = sumMacros(l.items.map((i) => macrosFor(i.per100, i.grams)));
          const time = new Date(l.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <ListRow
              key={l.id}
              title={l.items.map((i) => i.name).join(', ')}
              subtitle={`${time} · ${Math.round(m.kcal)} kcal${l.items.some((i) => !i.verified) ? ' · unverified' : ''}`}
              onClick={() => nav.push(<LogFormScreen log={l} />)}
            />
          );
        })}
      </div>

      <div className="list">
        <ListRow
          title="My Diet"
          subtitle={counts && `${plural(counts.foods, 'food')} · ${plural(counts.meals, 'meal')}`}
          onClick={() => nav.push(<MyDietScreen />)}
        />
        <ListRow
          title="At home"
          subtitle={counts && `${plural(counts.home, 'food')} in the kitchen`}
          onClick={() => nav.push(<AtHomeScreen />)}
        />
        <ListRow
          title="History"
          subtitle="Calendar of past days"
          onClick={() =>
            nav.push(
              <HistoryScreen
                onPickDay={(d) => {
                  setDate(d);
                  nav.pop();
                  window.scrollTo(0, 0);
                }}
              />,
            )
          }
        />
      </div>
    </Screen>
  );
}

const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
};

function dayLabel(date: string, today: string) {
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function Ring({ value, max }: { value: number; max: number }) {
  const c = 2 * Math.PI * 26;
  const f = Math.min(1, max > 0 ? value / max : 0);
  return (
    <svg className="ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" className="ring-track" />
      <circle cx="32" cy="32" r="26" className={value > max ? 'ring-fill over' : 'ring-fill'} strokeDasharray={`${f * c} ${c}`} />
    </svg>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="bar">
      <span className="small">
        {label} <span className="muted">{Math.round(value)} / {max} g</span>
      </span>
      <progress value={Math.min(value, max)} max={max} aria-label={label} />
    </div>
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
