import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { setFoodPhoto, type Food } from '@/db/diet';
import { namesMatch } from '@/lib/match';

// Native HTTP: Open Food Facts search doesn't send CORS headers for the app's origin.
const getJson = async (url: string, params: Record<string, string>) => {
  const res = await CapacitorHttp.get({ url, params });
  if (res.status !== 200) throw new Error(`Photo search error ${res.status}`);
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
};

/** A picture of the food from the web: its barcode's product photo, else a matching Open Food Facts product, else Wikipedia. */
export async function findPhotoUrl(food: Pick<Food, 'name' | 'barcode' | 'source' | 'sourceId'>): Promise<string | null> {
  const code = food.barcode ?? (food.source === 'off' ? food.sourceId : null);
  if (code) {
    const d = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, { fields: 'image_front_url' });
    if (d.product?.image_front_url) return d.product.image_front_url;
  }
  const off = await getJson('https://search.openfoodfacts.org/search', {
    q: food.name, page_size: '10', fields: 'product_name,brands,image_front_url',
  });
  const hit = (off.hits as { product_name?: string; brands?: string | string[]; image_front_url?: string }[]).find(
    (h) => h.image_front_url && namesMatch(food.name, `${[h.brands ?? ''].flat().join(' ')} ${h.product_name ?? ''}`),
  );
  if (hit) return hit.image_front_url!;
  const wiki = await getJson('https://en.wikipedia.org/w/api.php', {
    action: 'query', generator: 'search', gsrsearch: food.name, gsrlimit: '3', prop: 'pageimages', piprop: 'thumbnail',
    pithumbsize: '400', format: 'json', formatversion: '2', origin: '*',
  });
  const pages = ((wiki.query?.pages ?? []) as { title: string; index: number; thumbnail?: { source: string } }[]).sort((a, b) => a.index - b.index);
  return pages.find((p) => p.thumbnail && namesMatch(food.name, p.title))?.thumbnail!.source ?? null;
}

/** Copies a web photo into app storage so it shows offline. Returns its file URI (the URL itself in the browser preview). */
export async function keepPhoto(url: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return url;
  const res = await CapacitorHttp.get({ url, responseType: 'blob' }); // native: base64 data
  if (res.status !== 200) throw new Error(`Photo download error ${res.status}`);
  await Filesystem.mkdir({ path: 'photos', directory: Directory.Data, recursive: true }).catch(() => {});
  const { uri } = await Filesystem.writeFile({ path: `photos/${crypto.randomUUID()}.jpg`, data: res.data, directory: Directory.Data });
  return uri;
}

// Foods already looked up on this device, so a photo you removed isn't fetched again.
const TRIED = 'photo-lookups';
const readTried = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRIED) ?? '[]'));
  } catch {
    return new Set();
  }
};
let running = false;

/** Looks up a photo for every food that has none, one at a time, in the background. */
export async function findMissingPhotos(foods: Food[]) {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const tried = readTried();
    for (const f of foods) {
      if (f.photo || tried.has(f.id)) continue;
      try {
        const url = await findPhotoUrl(f);
        if (url) await setFoodPhoto(f.id, await keepPhoto(url), true);
        tried.add(f.id); // found or nothing to find; network errors are retried next time
        localStorage.setItem(TRIED, JSON.stringify([...tried]));
      } catch (e) {
        console.warn(`Photo lookup for ${f.name} failed`, e);
      }
    }
  } finally {
    running = false;
  }
}
