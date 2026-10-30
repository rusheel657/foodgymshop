import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect, useState } from 'react';

// Rest timer between sets. The end time is kept in localStorage (survives the app being killed) and a local
// notification is scheduled for it, so it buzzes with the screen off.

const KEY = 'rest-timer';
const NOTIFICATION_ID = 1;
const CHANNEL = 'rest';
const native = Capacitor.isNativePlatform();

type Rest = { endsAt: number; total: number } | null;

const read = (): Rest => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const listeners = new Set<() => void>();

async function schedule(endsAt: number | null) {
  if (!native) return;
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => {});
  if (endsAt === null || endsAt <= Date.now()) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: NOTIFICATION_ID, channelId: CHANNEL, title: 'Rest over', body: 'Time for your next set.',
      schedule: { at: new Date(endsAt), allowWhileIdle: true },
    }],
  }).catch((e) => console.warn('rest notification', e));
}

function set(rest: Rest) {
  if (rest) localStorage.setItem(KEY, JSON.stringify(rest));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
  void schedule(rest?.endsAt ?? null);
}

/** Asks for notification permission and creates the channel. Call when a workout starts. */
export async function prepareRestNotifications() {
  if (!native) return;
  await LocalNotifications.requestPermissions().catch(() => {});
  await LocalNotifications.createChannel({ id: CHANNEL, name: 'Rest timer', importance: 5, vibration: true }).catch(() => {});
}

export const startRest = (seconds: number) => set({ endsAt: Date.now() + seconds * 1000, total: seconds });
export const stopRest = () => set(null);
export function addRest(seconds: number) {
  const r = read();
  if (!r) return;
  const endsAt = r.endsAt + seconds * 1000;
  if (endsAt <= Date.now()) set(null);
  else set({ endsAt, total: Math.max(r.total, Math.ceil((endsAt - Date.now()) / 1000)) });
}

/** Seconds left and total, ticking every 250 ms; null when no rest is running. Buzzes once at zero. */
export function useRest(): { left: number; total: number } | null {
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    listeners.add(update);
    const timer = setInterval(() => {
      const r = read();
      if (r && r.endsAt <= Date.now()) {
        set(null);
        if (native) void Haptics.vibrate({ duration: 600 }).catch(() => {});
      }
      update();
    }, 250);
    return () => {
      listeners.delete(update);
      clearInterval(timer);
    };
  }, []);
  const r = read();
  return r ? { left: Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000)), total: r.total } : null;
}
