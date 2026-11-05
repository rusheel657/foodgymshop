import { useState } from 'react';

import { EmptyState, Page } from '@/components/ui';
import { listFoods } from '@/db/diet';
import { itemsBetween } from '@/db/log';
import { ymd } from '@/lib/history';
import { animate } from '@/lib/motion';
import { money, spendSummary } from '@/lib/price';
import { useLive } from '@/lib/use-live';

/** A month of food spending: the total, a daily average, each food's share and each day's cost.
 *  `date`: a day in the month to open on. Tapping a day shows it on the Food tab (`onPickDay`). */
export function SpendingScreen({ date, onPickDay }: { date: string; onPickDay: (date: string) => void }) {
  const now = new Date();
  const [month, setMonth] = useState({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });
  const from = ymd(new Date(month.y, month.m, 1));
  const to = ymd(new Date(month.y, month.m + 1, 1));
  const items = useLive(() => itemsBetween(from, to), ['food_logs', 'food_log_items'], [from]);
  const foods = useLive(() => listFoods(true), ['foods']);
  if (!items || !foods) return null;

  const s = spendSummary(items, foods);
  const isThisMonth = month.y === now.getFullYear() && month.m === now.getMonth();
  const daysSoFar = isThisMonth ? now.getDate() : new Date(month.y, month.m + 1, 0).getDate();
  const top = s.byFood[0]?.cost ?? 0;
  const shift = (by: number) =>
    animate('fade', () => setMonth(({ y, m }) => ({ y: new Date(y, m + by, 1).getFullYear(), m: new Date(y, m + by, 1).getMonth() })));

  return (
    <Page title="Spending">
      <div className="date-nav month-nav">
        <button type="button" className="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>{new Date(month.y, month.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="icon-button" aria-label="Next month" disabled={isThisMonth} onClick={() => shift(1)}>
          ›
        </button>
      </div>

      {s.total === 0 ? (
        <EmptyState text="No priced food logged this month. Add a shopping size and price to your foods in My Diet." />
      ) : (
        <>
          <div className="card">
            <span className="label">{isThisMonth ? 'This month so far' : 'This month'}</span>
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
