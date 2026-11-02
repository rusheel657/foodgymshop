import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Health } from '@capgo/capacitor-health';
import { useEffect } from 'react';

import { dayTargets, saveSteps } from '@/db/activity';
import { stepsByDay } from '@/lib/burn';
import { addDays } from '@/lib/history';
import { localDate, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { useLive } from '@/lib/use-live';

// Steps from Health Connect (Android). Only read access to steps is asked for.

const READ = { read: ['steps' as const] };

export async function healthStatus(): Promise<'unavailable' | 'off' | 'on'> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  const { available } = await Health.isAvailable().catch(() => ({ available: false }));
  if (!available) return 'unavailable';
  const auth = await Health.checkAuthorization(READ).catch(() => null);
  return auth?.readAuthorized.includes('steps') ? 'on' : 'off';
}

/** Opens Health Connect's permission screen; true if steps can now be read. */
export async function connectHealth() {
  const auth = await Health.requestAuthorization(READ);
  const ok = auth.readAuthorized.includes('steps');
  if (ok) await syncSteps(true);
  return ok;
}

let lastSync = 0;

/** Copies steps per day for the last 5 weeks into the local database (at most every 50 s unless forced). */
export async function syncSteps(force = false) {
  if (!force && Date.now() - lastSync < 50_000) return;
  if ((await healthStatus()) !== 'on') return;
  lastSync = Date.now();
  const today = localDate();
  const start = new Date(`${addDays(today, -35)}T00:00`);
  // Hourly totals added up per local date. The plugin's 'day' buckets are fixed 24 h blocks from the start time, so after
  // a clock change they run 23:00–23:00 and each day's steps landed on the day before.
  const { samples } = await Health.queryAggregated({
    dataType: 'steps', bucket: 'hour', aggregation: 'sum', startDate: start.toISOString(), endDate: new Date().toISOString(),
  });
  await saveSteps(stepsByDay(samples.map((s) => ({ start: s.startDate, steps: s.values.sum ?? s.value }))), addDays(today, -35));
}

/** Targets for each of `dates` from steps + workouts (falls back to the activity level), refreshing steps first. */
export function useTargets(dates: string[]) {
  const { profile } = useAccount();
  useEffect(() => {
    const sync = () => void syncSteps().catch(() => {});
    sync();
    const sub = App.addListener('resume', sync);
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), 60_000); // steps update live
    return () => {
      clearInterval(timer);
      void sub.then((s) => s.remove());
    };
  }, []);
  const loaded = useLive(
    async () => (profile ? dayTargets(profile, dates) : undefined),
    ['daily_steps', 'workouts', 'workout_sets', 'weight_logs', 'profile'],
    [profile, dates.join()],
  );
  if (!loaded || !profile || dates.every((d) => loaded.has(d))) return loaded;
  // Just switched to other dates (swiped to last week): the previous dates' data is still showing until the new load
  // lands, so fill the gaps with the activity-level target instead of leaving them undefined.
  const filled = new Map(loaded);
  for (const d of dates) if (!filled.has(d)) filled.set(d, { ...targetsFor(profile, new Date(`${d}T12:00`)), burn: null });
  return filled;
}
