import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

// The Google sign-in redirect (…/auth?code=…) is not a screen: open the app at home and let the
// root guards pick sign-in / onboarding / tabs.
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (!/(^|\/)auth([?#/]|$)/.test(path)) return path;
    // If Android relaunched the app for the redirect, the browser-session promise is gone: finish sign-in here.
    const code = Linking.parse(path).queryParams?.code;
    if (initial && typeof code === 'string') await supabase.auth.exchangeCodeForSession(code);
    return '/';
  } catch {
    return '/';
  }
}
