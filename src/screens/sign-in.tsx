import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { finishSignIn, signInWithGoogle } from '@/lib/supabase';

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const done = async (url: string) => {
      if (!url.startsWith('foodgymshop://auth')) return;
      setError(await finishSignIn(url));
      setBusy(false);
    };
    // getLaunchUrl covers Android killing the app while the browser was open.
    App.getLaunchUrl().then((l) => l && done(l.url));
    const link = App.addListener('appUrlOpen', ({ url }) => done(url));
    const closed = Browser.addListener('browserFinished', () => setBusy(false));
    return () => {
      link.then((h) => h.remove());
      closed.then((h) => h.remove());
    };
  }, []);

  async function onClick() {
    setBusy(true);
    setError(null);
    const message = await signInWithGoogle().catch((e: Error) => e.message);
    if (message) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <main className="screen sign-in">
      <div className="hero">
        <h1>Food · Gym · Shop</h1>
        <p className="muted">Track meals, lifts and groceries.</p>
      </div>
      {error && <p className="small danger center">{error}</p>}
      <Button title="Continue with Google" onClick={onClick} busy={busy} />
    </main>
  );
}
