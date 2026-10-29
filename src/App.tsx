import { Browser } from '@capacitor/browser';
import { useEffect, useState } from 'react';

import { ProfileForm } from '@/components/profile-form';
import { Screen } from '@/components/ui';
import { saveProfile } from '@/db/profile';
import { AccountProvider, useAccount, useProfile, useSession } from '@/lib/account';
import { NavProvider } from '@/lib/nav';
import { checkForUpdate } from '@/lib/updater';
import { SignInScreen } from '@/screens/sign-in';
import { FoodScreen, GymScreen, ProfileScreen, ShopScreen } from '@/screens/tabs';

const TABS = [
  { key: 'food', label: 'Food', icon: 'M7 2v9a2 2 0 0 0 2 2v9M11 2v9M7 2v0M9 2v6M17 2c-2 2-2 6 0 8v12', Screen: FoodScreen },
  { key: 'gym', label: 'Gym', icon: 'M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12', Screen: GymScreen },
  { key: 'shop', label: 'Shop', icon: 'M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01', Screen: ShopScreen },
  { key: 'profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0', Screen: ProfileScreen },
] as const;

export function App() {
  const session = useSession();
  const profile = useProfile(session?.user.id);
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate().then(setApkUrl, (e) => console.warn('Update check failed', e));
  }, []);

  if (session === undefined || (session && profile === undefined)) return null;
  return (
    <>
      {apkUrl && (
        <button type="button" className="update-bar" onClick={() => Browser.open({ url: apkUrl })}>
          New version available — tap to download
        </button>
      )}
      {!session ? (
        <SignInScreen />
      ) : (
        <AccountProvider value={{ userId: session.user.id, email: session.user.email, profile: profile ?? null }}>
          {profile ? (
            <NavProvider>
              <Tabs />
            </NavProvider>
          ) : (
            <Onboarding />
          )}
        </AccountProvider>
      )}
    </>
  );
}

function Onboarding() {
  const { userId } = useAccount();
  return (
    <Screen title="Set up">
      <ProfileForm submitLabel="Start" onSubmit={(p) => saveProfile(userId, p)} />
    </Screen>
  );
}

function Tabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('food');
  const Current = TABS.find((t) => t.key === tab)!.Screen;
  return (
    <>
      <Current />
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-current={t.key === tab} onClick={() => setTab(t.key)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
