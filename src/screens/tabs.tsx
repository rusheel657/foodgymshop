import { useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { Button, EmptyState, Screen } from '@/components/ui';
import { saveProfile, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { supabase } from '@/lib/supabase';
import { applyTheme, getThemePref } from '@/lib/theme';
import { BUNDLE } from '@/lib/updater';

export function FoodScreen() {
  const { profile } = useAccount();
  const t = profile && targetsFor(profile);
  return (
    <Screen title="Today">
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
  return (
    <Screen title="Shopping list">
      <EmptyState text="Nothing on the list." />
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
