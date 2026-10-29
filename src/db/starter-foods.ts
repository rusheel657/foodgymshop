import { all, run, write } from '@/db/db';

// One-time list of the user's regular foods (per 100 g), looked up on Open Food Facts on 2026-10-29.
// Added once per device on first launch after this update; foods already in My Diet are skipped.
const FOODS = [
  { name: "20% Fat Lamb Mince (Sainsbury's)", kcal: 269, protein: 21.5, carbs: 0.5, fat: 20, barcode: '01621372', unit: 'pack' },
  // Not in Open Food Facts: typical UK raw chicken breast fillet label.
  { name: "Chicken Breast Fillets (Sainsbury's)", kcal: 106, protein: 24, carbs: 0, fat: 1.1, barcode: null, unit: 'pack' },
  { name: 'Tropicana Smooth Orange Juice', kcal: 41, protein: 0.8, carbs: 9.3, fat: 0, barcode: '5022313260143', unit: 'bottle' },
  { name: 'Rebel Kitchen Raw Coconut Water', kcal: 22, protein: 0.1, carbs: 4.9, fat: 0.2, barcode: '5060342450005', unit: 'carton' },
  // Not in Open Food Facts: standard butter values.
  { name: 'Raw Farm Raw Butter', kcal: 717, protein: 0.9, carbs: 0.1, fat: 81, barcode: null, unit: 'block' },
  { name: "Green & Black's Organic Dark Chocolate 70%", kcal: 580, protein: 9.1, carbs: 36, fat: 42, barcode: '7281427219142', unit: 'bar' },
  // "The Great White" isn't in Open Food Facts; this is Jason's plain sourdough loaf.
  { name: "Jason's Sourdough The Great White", kcal: 230, protein: 10.7, carbs: 44.1, fat: 0.8, barcode: '5025125000181', unit: 'loaf' },
  // Organic isn't listed separately; Sainsbury's free range eggs (same nutrition).
  { name: "Organic Free Range Eggs (Sainsbury's)", kcal: 143, protein: 14.1, carbs: 0.5, fat: 9.6, barcode: null, unit: 'box' },
  { name: 'Rowse Organic Honey', kcal: 329, protein: 0.5, carbs: 81.5, fat: 0.5, barcode: '5011273024759', unit: 'jar' },
];

const FLAG = 'starter-foods-v1';
let running: Promise<void> | undefined;

/** Safe to call repeatedly (React StrictMode runs effects twice): only the first call does the work. */
export function addStarterFoods(userId: string) {
  return (running ??= insertOnce(userId));
}

async function insertOnce(userId: string) {
  if (localStorage.getItem(FLAG)) return;
  const existing = await all<{ name: string; barcode: string | null }>(
    'SELECT name, barcode FROM foods WHERE deleted_at IS NULL',
  );
  const names = new Set(existing.map((f) => f.name.toLowerCase()));
  const barcodes = new Set(existing.map((f) => f.barcode).filter(Boolean));
  const now = new Date().toISOString();
  await write(['foods'], async () => {
    for (const f of FOODS) {
      if (names.has(f.name.toLowerCase()) || (f.barcode && barcodes.has(f.barcode))) continue;
      await run(
        `INSERT INTO foods (id, user_id, updated_at, dirty, name, kcal_100g, protein_100g, carbs_100g, fat_100g,
                            source, source_id, barcode, shop_unit, shop_qty)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [crypto.randomUUID(), userId, now, f.name, f.kcal, f.protein, f.carbs, f.fat,
          f.barcode ? 'off' : 'manual', f.barcode, f.barcode, f.unit],
      );
    }
  });
  localStorage.setItem(FLAG, now);
}
