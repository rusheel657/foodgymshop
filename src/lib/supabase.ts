import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';

import type { AiItem } from '@/lib/nutrition';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env');

const native = Capacitor.isNativePlatform();

// The APK comes back via the foodgymshop:// deep link; the browser dev build comes back to its own origin.
// Both must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
export const AUTH_REDIRECT = native ? 'foodgymshop://auth' : window.location.origin;

export const supabase = createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: !native },
});

/** Starts Google sign-in. On Android it finishes in finishSignIn() when the deep link comes back. */
export async function signInWithGoogle(): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: native },
  });
  if (error) return error.message;
  if (native) await Browser.open({ url: data.url });
  return null;
}

/** Handles foodgymshop://auth?code=… Returns an error message, or null on success. */
export async function finishSignIn(link: string): Promise<string | null> {
  await Browser.close().catch(() => {});
  const u = new URL(link);
  // Errors can come back in the query or the #fragment.
  const params = new URLSearchParams(`${u.search.slice(1)}&${u.hash.slice(1)}`);
  const message = params.get('error_description');
  if (message) return message;
  const code = params.get('code');
  if (!code) return 'Sign-in failed: no code returned.';
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error?.message ?? null;
}

export type UsdaFood = { id: string; name: string; kcal: number; protein: number; carbs: number; fat: number };

/** USDA FoodData Central search via the usda-search Edge Function (keeps the API key off the phone). */
export async function searchUsda(query: string): Promise<UsdaFood[]> {
  const { data, error } = await supabase.functions.invoke<UsdaFood[]>('usda-search', { body: { query } });
  if (error) throw new Error(`Food search failed: ${error.message}`);
  return data ?? [];
}

/** Photo (base64 JPEG) + My Diet names → matched items, via the analyze-meal Edge Function (Gemini). */
export async function analyzeMeal(body: {
  image: string;
  foods: { id: string; name: string; usualGrams?: number }[];
  meals: { id: string; name: string; items: { name: string; grams: number }[] }[];
  notes: string[];
  rules: string[];
}): Promise<AiItem[]> {
  const { data, error } = await supabase.functions.invoke<{ items: AiItem[] }>('analyze-meal', { body });
  if (error) {
    // Non-2xx: the function's { error } message is in the response body.
    const message = await (error.context as Response | undefined)?.json?.().then((j) => j.error).catch(() => null);
    throw new Error(message ?? `Photo analysis failed: ${error.message}`);
  }
  return data?.items ?? [];
}
