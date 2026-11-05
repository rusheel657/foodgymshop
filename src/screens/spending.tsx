import { useState } from 'react';

import { EmptyState, Page, Segmented } from '@/components/ui';
import { listFoods } from '@/db/diet';
import { itemsBetween } from '@/db/log';
import { addDays, periodRange, ymd } from '@/lib/history';
import { animate } from '@/lib/motion';
import { money, spendSummary } from '@/lib/price';
import { useLive } from '@/lib/use-live';

/** A calendar week (from Monday) or month of food spending: the total, a daily average, each food's share and each day's cost.
 *  `date`: a day in the period to open on. Tapping a day shows it on the Food tab (`onPickDay`). */
export function SpendingScreen({ date, onPickDay }: { date: string; onPickDay: (date: string) => void }) {
  const today = ymd(new Date());
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [anchor, setAnchor] = useState(date);
  const { from, to } = periodRange(period, anchor);
  const items = useLive(() => itemsBetween(from, to), ['food_logs', 'food_log_items'], [from]);
  const foods = useLive(() => listFoods(true), ['foods']);
  if (!items || !foods) return null;

  const s = spendSummary(items, foods);
  const isCurrent = from <= today && today < to;
  const end = isCurrent ? addDays(today, 1) : to;
  const daysSoFar = Math.round((new Date(`${end}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86_400_000);
  const top = s.byFood[0]?.cost ?? 0;
  const shift = (by: number) =>
    animate('fade', () => setAnchor(period === 'week' ? addDays(from, 7 * by) : ymd(new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1 + by, 1))));
  const short = (d: string) => new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const title =
    period === 'week'
      ? `${short(from)} – ${short(addDays(to, -1))}`
      : new Date(`${from}T12:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const name = period === 'week' ? 'week' : 'month';

  return (
    <Page title="Spending">
      <Segmented
        options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] as const}
        value={period}
        onChange={(p) => animate('fade', () => { setPeriod(p); setAnchor(today); })}
      />
      <div className="date-nav month-nav">
        <button type="button" className="icon-button" aria-label={`Previous ${name}`} onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label={`Next ${name}`} disabled={isCurrent} onClick={() => shift(1)}>
          ›
        </button>
      </div>

      {s.total === 0 ? (
        <EmptyState text={`No priced food logged this ${name}. Add a shopping size and price to your foods in My Diet.`} />
      ) : (
        <>
          <div className="card">
            <span className="label">{isCurrent ? `This ${name} so far` : `Spent that ${name}`}</span>
            <strong className="spend-total">{money(s.total)}</strong>
            <span className="muted">{money(s.total / daysSoFar)} a day on average</span>
            {s.unpriced > 0 && (
              <span className="small muted">{s.unpriced === 1 ? "1 item had no price, so it isn't counted." : `${s.unpriced} items had no price, so they aren't counted.`}</span>
            )}
          </div>

          <section className="stack-sm">
            <h2 className="section-title">By food</h2>
            <div className="list">
              {s.byFood.map((f) => (
                <div key={f.name} className="list-row spend-row">
                  <span className="grow">
                    <span className="list-title">{f.name}</span>
                    <span className="small muted">
                      {Math.round(f.grams)} g · {Math.round((f.cost / s.total) * 100)}%
                    </span>
                    <span className="spend-bar" style={{ width: `${(f.cost / top) * 100}%` }} aria-hidden="true" />
                  </span>
                  <strong>{money(f.cost)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="stack-sm">
            <h2 className="section-title">By day</h2>
            <div className="list">
              {[...s.byDay].sort(([a], [b]) => b.localeCompare(a)).map(([day, cost]) => (
                <button key={day} type="button" className="list-row" onClick={() => onPickDay(day)}>
                  <span className="list-title">{new Date(`${day}T12:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <strong>{money(cost)}</strong>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </Page>
  );
}
