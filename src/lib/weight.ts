// Weight trend maths. Pure functions: no imports, so node:test can load this file.

export type WeightPoint = { date: string; kg: number }; // date "YYYY-MM-DD"

const dayNum = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** kg per week over the last `days` days (least-squares slope, so one odd weigh-in doesn't swing it). null if under 2 entries. */
export function weeklyRate(points: WeightPoint[], today: string, days = 28): number | null {
  const from = dayNum(today) - days;
  const recent = points.filter((p) => dayNum(p.date) >= from);
  if (recent.length < 2) return null;
  const xs = recent.map((p) => dayNum(p.date));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = recent.reduce((s, p) => s + p.kg, 0) / recent.length;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = recent.reduce((s, p, i) => s + (xs[i] - mx) * (p.kg - my), 0) / den;
  return slope * 7;
}

/** Points on or after `from` (all when null), oldest first. */
export const inRange = (points: WeightPoint[], from: string | null) =>
  [...points].filter((p) => !from || p.date >= from).sort((a, b) => a.date.localeCompare(b.date));

/** About 4 round axis values covering min..max (steps of 0.5, 1, 2 or 5 kg). */
export function ticks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const step = [0.5, 1, 2, 5, 10].find((s) => span / s <= 4) ?? 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}
