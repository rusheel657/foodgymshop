import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY in .env');

export const supabase = createClient(url, key, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Opens Google sign-in in a browser tab. Returns an error message, or null on success/cancel. */
export async function signInWithGoogle(): Promise<string | null> {
  // exp://<ip>:8081/--/auth in Expo Go, foodgymshop://auth in the APK. Both must be allowed in Supabase.
  const redirectTo = Linking.createURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return error.message;

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return null;

  // Errors can come back in the query or the #fragment; fold both into one query string.
  const { queryParams } = Linking.parse(res.url.replace('#', res.url.includes('?') ? '&' : '?'));
  if (queryParams?.error_description) return String(queryParams.error_description);
  if (typeof queryParams?.code !== 'string') return 'Sign-in failed: no code returned.';

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(queryParams.code);
  return exchangeError?.message ?? null;
}
