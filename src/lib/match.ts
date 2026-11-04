const words = (s: string) =>
  new Set(
    s.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 3)
      .map((w) => w.replace(/h(?=urt)/, '').replace(/s$/, '')), // yoghurt = yogurt, eggs = egg
  );

/** True when `other` contains at least half of the food name's words, so a search hit is really that food
 *  ("Tropicana Smooth Orange with no bits" fits "Tropicana Smooth Orange Juice"; "Raw cheddar" doesn't fit "Raw Farm Raw Butter"). */
export function namesMatch(food: string, other: string) {
  const a = words(food);
  const b = words(other);
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return a.size > 0 && shared * 2 >= a.size;
}
