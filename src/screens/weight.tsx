import { useState } from 'react';

import { Button, EmptyState, NumberInput, num, Page, Segmented } from '@/components/ui';
import { deleteWeight, listWeights, localDate, saveWeight, type WeightEntry } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { addDays } from '@/lib/history';
import { animate } from '@/lib/motion';
import { useLive } from '@/lib/use-live';
import { inRange, ticks, weeklyRate } from '@/lib/weight';

const RANGES = [
  { value: 30, label: '1M' },
  { value: 90, label: '3M' },
  { value: 365, label: '1Y' },
  { value: 0, label: 'All' },
] as const;

const kg = (v: number) => `${Math.round(v * 10) / 10} kg`;
const fmtDate = (d: string, withYear = false) =>
  new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** Log today's weight, see the trend over time. */
export function WeightScreen() {
  const { userId, profile } = useAccount();
  const entries = useLive(listWeights, ['weight_logs']);
  const today = localDate();
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>(90);
  const todays = entries?.find((e) => e.date === today);
  const [value, setValue] = useState<string | null>(null);
  if (!entries) return null;

  const typed = value ?? (todays ? String(todays.kg) : '');
  const v = num(typed);
  const invalid = !(v >= 30 && v <= 300);
  const points = inRange(entries, range ? addDays(today, -range) : null);
  const rate = weeklyRate(entries, today);
  const latest = entries.at(-1);
  const goal = profile?.goal !== 'maintain' ? profile?.goalWeightKg ?? null : null;

  async function save() {
    await saveWeight(userId, today, Math.round(v * 10) / 10);
    setValue(null);
  }

  return (
    <Page title="Weight">
      <div className="card stack-sm">
        <span className="label">{todays ? "Today's weight (logged)" : "Today's weight"}</span>
        <div className="row weigh-in">
          <NumberInput label="Today's weight" value={typed} onChange={setValue} suffix="kg" placeholder={latest ? String(latest.kg) : '80'} />
          <Button title={todays ? 'Update' : 'Log'} onClick={save} disabled={invalid || v === todays?.kg} />
        </div>
      </div>

      {latest && (
        <div className="weight-stats">
          <div>
            <strong>{kg(latest.kg)}</strong>
            <span className="small muted">now</span>
          </div>
          <div>
            <strong>{rate === null ? '–' : `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(Math.round(rate * 100) / 100)} kg`}</strong>
            <span className="small muted">a week (4-week trend)</span>
          </div>
          {goal !== null && goal !== undefined && (
            <div>
              <strong>{kg(Math.abs(latest.kg - goal))}</strong>
              <span className="small muted">to {kg(goal)}</span>
            </div>
          )}
        </div>
      )}

      <Segmented options={RANGES} value={range} onChange={(r) => animate('fade', () => setRange(r))} />
      {points.length === 0 ? (
        <EmptyState text="No weigh-ins in this range yet." />
      ) : (
        <WeightChart points={points} goal={goal ?? null} />
      )}

      <section className="stack-sm">
        <h2 className="section-title">Weigh-ins</h2>
        <div className="list">
          {[...entries].reverse().map((e, i, list) => (
            <WeightRow key={e.id} entry={e} prev={list[i + 1]} only={list.length === 1} />
          ))}
        </div>
      </section>
    </Page>
  );
}

function WeightRow({ entry: e, prev, only }: { entry: WeightEntry; prev?: WeightEntry; only: boolean }) {
  const diff = prev ? e.kg - prev.kg : null;
  return (
    <div className="list-row">
      <span className="grow">
        <span className="list-title">{fmtDate(e.date, true)}</span>
        {diff !== null && Math.abs(diff) >= 0.05 && (
          <span className="small muted">
            {diff > 0 ? '+' : '−'}
            {kg(Math.abs(diff))} since {fmtDate(prev!.date)}
          </span>
        )}
      </span>
      <strong>{kg(e.kg)}</strong>
      {/* The latest weigh-in is the profile's weight, so the last one can't go. */}
      {!only && (
        <button type="button" className="icon-button" aria-label={`Delete ${fmtDate(e.date)}`} onClick={() => confirm(`Delete ${fmtDate(e.date)}?`) && deleteWeight(e.id)}>
          ×
        </button>
      )}
    </div>
  );
}

const W = 340;
const H = 200;
const PAD = { l: 34, r: 10, t: 12, b: 24 };

/** One line over time; dashed goal line; touch or hover a point to read it. */
function WeightChart({ points, goal }: { points: { date: string; kg: number }[]; goal: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const t0 = Date.parse(points[0].date);
  const t1 = Math.max(Date.parse(points.at(-1)!.date), t0 + 86_400_000);
  const vals = points.map((p) => p.kg).concat(goal !== null && Math.abs(goal - points.at(-1)!.kg) < 6 ? [goal] : []);
  const ys = ticks(Math.min(...vals), Math.max(...vals));
  const [lo, hi] = [ys[0], ys.at(-1)!];
  const x = (d: string) => PAD.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join('');
  const pick = (clientX: number, box: DOMRect) => {
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px) && (best = i));
    setHover(best);
  };
  const h = hover !== null ? points[hover] : null;
  const showGoal = goal !== null && goal >= lo && goal <= hi;
  return (
    <figure className="weight-chart" aria-label={`Weight from ${fmtDate(points[0].date)} to ${fmtDate(points.at(-1)!.date)}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}>
        {ys.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text className="axis" x={PAD.l} y={H - 6}>
          {fmtDate(points[0].date)}
        </text>
        <text className="axis" x={W - PAD.r} y={H - 6} textAnchor="end">
          {fmtDate(points.at(-1)!.date)}
        </text>
        {showGoal && (
          <>
            <line className="goal" x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} />
            <text className="axis" x={W - PAD.r} y={y(goal) - 5} textAnchor="end">
              goal {goal}
            </text>
          </>
        )}
        <path className="line" d={path} />
        {points.length <= 40 && points.map((p) => <circle key={p.date} className="dot" cx={x(p.date)} cy={y(p.kg)} r={3} />)}
        {h && (
          <>
            <line className="cross" x1={x(h.date)} x2={x(h.date)} y1={PAD.t} y2={H - PAD.b} />
            <circle className="dot active" cx={x(h.date)} cy={y(h.kg)} r={5} />
          </>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(x(h.date) / W) * 100}%` }}>
          <strong>{kg(h.kg)}</strong>
          <span>{fmtDate(h.date, true)}</span>
        </div>
      )}
    </figure>
  );
}
