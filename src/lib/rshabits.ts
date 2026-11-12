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

type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** Posts a meal photo (app storage URI) to your RSHabits "Meals" photos, titled with its name (cut to RSHabits' 80
 *  characters). `macros`: drawn on the photo as a sticker; null posts the photo as it is. */
export async function postMealToHabits(photo: string, title: string, macros: Macros | null) {
  const link = habitsLink();
  if (!link) throw new Error('Connect RSHabits in Profile first.');
  const image = await photoBase64(photo, 1280, macros ? (ctx, w, h) => drawSticker(ctx, w, h, macros) : undefined);
  const t = title.trim() || 'Meal';
  await call({ code: link.code, action: 'meal', image, title: t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t });
}

/** Whether posts get the macros sticker (remembered on this device; on by default). */
export const stickerOn = () => read<boolean>('rshabits-sticker', true);
export const setStickerOn = (on: boolean) => write('rshabits-sticker', on);

/** A white rounded card in the bottom-left corner: calories big, then protein · carbs · fat. */
function drawSticker(ctx: CanvasRenderingContext2D, w: number, h: number, m: Macros) {
  const u = Math.min(w, h) / 100; // sizes scale with the photo
  const big = `${Math.round(m.kcal)} kcal`;
  const small = `P ${Math.round(m.protein)}g · C ${Math.round(m.carbs)}g · F ${Math.round(m.fat)}g`;
  const font = (px: number, weight: number) => `${weight} ${px}px -apple-system, Roboto, "Segoe UI", sans-serif`;
  ctx.font = font(7 * u, 800);
  const bw = ctx.measureText(big).width;
  ctx.font = font(3.8 * u, 600);
  const sw = ctx.measureText(small).width;
  const pad = 3.5 * u, cw = Math.max(bw, sw) + pad * 2, ch = 19 * u, x = 4 * u, y = h - ch - 4 * u;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 3 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, cw, ch, 4 * u);
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#111';
  ctx.font = font(7 * u, 800);
  ctx.fillText(big, x + pad, y + pad + 6 * u);
  ctx.fillStyle = '#555';
  ctx.font = font(3.8 * u, 600);
  ctx.fillText(small, x + pad, y + ch - pad);
}
