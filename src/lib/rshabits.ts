// The RSHabits link: a code made in RSHabits (You → Health → RSFitness) and pasted in Profile here. Logging your weight
// ticks your weighing habits there, and a meal photo can be posted to your RSHabits "Meals" photos with its macros.
// Calls RSHabits' fitness-link Edge Function; the code is the only credential, kept on this device.
import { photoBase64 } from '@/lib/photos';

const URL = 'https://octfrytlaexsswcciqoh.supabase.co/functions/v1/fitness-link';
const KEY = 'rshabits-link'; // { code, name }
const PENDING = 'rshabits-weigh-days'; // days whose weight tick didn't reach RSHabits (offline)

type Link = { code: string; name: string };
const read = <T,>(k: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable: the link just isn't remembered */
  }
};

export const habitsLink = () => read<Link | null>(KEY, null);

/** Throws the server's message; `offline` marks failures worth retrying later. */
async function call(body: Record<string, unknown>) {
  const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) throw Object.assign(new Error('No connection. Try again.'), { offline: true });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (habitsLink()?.code === body.code) write(KEY, null); // disconnected in RSHabits
    throw new Error('Not connected to RSHabits. Make a new code in RSHabits (You → Health → RSFitness).');
  }
  if (!res.ok) throw Object.assign(new Error(out.error || 'RSHabits is busy. Try again.'), { offline: res.status >= 500 });
  return out;
}

export async function connectHabits(code: string) {
  code = code.trim();
  if (!/^rsf_[0-9a-f]{64}$/.test(code)) throw new Error('That isn’t an RSHabits code. Copy it from RSHabits: You → Health → RSFitness.');
  const { name } = await call({ code, action: 'check' });
  write(KEY, { code, name: name || '' });
}

export const disconnectHabits = () => {
  write(KEY, null);
  write(PENDING, null);
};

/** Weight logged on `day`: ticks weighing habits in RSHabits (silently; days that fail offline are retried later). */
export async function tickWeighHabits(day?: string) {
  const link = habitsLink();
  if (!link) return;
  const days = [...new Set([...read<string[]>(PENDING, []), ...(day ? [day] : [])])];
  const left: string[] = [];
  for (const d of days) {
    try {
      await call({ code: link.code, action: 'weight', day: d });
    } catch (e) {
      if ((e as { offline?: boolean }).offline) left.push(d);
    }
  }
  write(PENDING, left.length ? left.slice(-3) : null); // RSHabits only takes today and yesterday anyway
}

/** Posts a meal photo (app storage URI) to your RSHabits "Meals" photos. `title` is cut to RSHabits' 80 characters. */
export async function postMealToHabits(photo: string, title: string) {
  const link = habitsLink();
  if (!link) throw new Error('Connect RSHabits in Profile first.');
  await call({ code: link.code, action: 'meal', image: await photoBase64(photo, 1280), title: title.slice(0, 80) });
}

/** "Chicken rice · 650 kcal · P 45 C 60 F 20", the name shortened so it fits in 80 characters. */
export function mealTitle(name: string, m: { kcal: number; protein: number; carbs: number; fat: number }) {
  const macros = ` · ${Math.round(m.kcal)} kcal · P ${Math.round(m.protein)} C ${Math.round(m.carbs)} F ${Math.round(m.fat)}`;
  const room = 80 - macros.length;
  const n = name.trim() || 'Meal';
  return (n.length > room ? `${n.slice(0, room - 1).trimEnd()}…` : n) + macros;
}
