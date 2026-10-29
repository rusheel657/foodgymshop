import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

import { onChange } from '@/db/db';
import { loadProfile, type Profile } from '@/db/profile';
import { supabase } from '@/lib/supabase';

type Account = { userId: string; email?: string; profile: Profile | null };

const AccountContext = createContext<Account | null>(null);
export const AccountProvider = AccountContext.Provider;

/** Signed-in user + profile. Only valid inside the signed-in screens. */
export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount used outside a signed-in screen');
  return account;
}

/** undefined while loading, null when signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Live profile for a user: undefined while loading, null if onboarding isn't done. */
export function useProfile(userId?: string) {
  const [state, setState] = useState<{ userId: string; profile: Profile | null }>();
  useEffect(() => {
    if (!userId) return;
    const load = () => loadProfile(userId).then((profile) => setState({ userId, profile }));
    load();
    return onChange((tables) => {
      if (tables.includes('profile') || tables.includes('weight_logs')) load();
    });
  }, [userId]);
  return state && state.userId === userId ? state.profile : undefined;
}
