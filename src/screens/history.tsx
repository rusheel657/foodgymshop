import { useState } from 'react';

import { EmptyState, Page } from '@/components/ui';
import { dailyTotals } from '@/db/log';
import { targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { dayStatus, monthGrid, monthStats, proteinHit, ymd } from '@/lib/history';
import { useLive } from '@/lib/use-live';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month calendar of what was eaten each day. Tapping a day shows it on the Food tab (`onPickDay`). */
export function HistoryScreen({ onPickDay }: { onPickDay: (date: string) => void }) {
  const { profile } = useAccount();
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const from = ymd(new Date(month.y, month.m, 1));
  const to = ymd(new Date(month.y, month.m + 1, 1));
  const days = useLive(() => dailyTotals(from, to), ['food_logs', 'food_log_items'], [from]);
  if (!days || !profile) return null;

  // shortcut: uses today's targets for every past day (targets aren't stored per day); store them if they change often.
  const t = targetsFor(profile);
  const stats = monthStats(days, t);
  const today = ymd(now);
  const isThisMonth = month.y === now.getFullYear() && month.m === now.getMonth();
  const shift = (by: number) => setMonth(({ y, m }) => ({ y: new Date(y, m + by, 1).getFullYear(), m: new Date(y, m + by, 1).getMonth() }));
  const r = Math.round;

  return (
    <Page title="History">
      <div className="date-nav month-nav">
        <button type="button" className="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>{new Date(month.y, month.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="icon-button" aria-label="Next month" disabled={isThisMonth} onClick={() => shift(1)}>
          ›
        </button>
      </div>

      <div className="calendar" role="grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="small muted cal-head">
            {d}
          </span>
        ))}
        {monthGrid(month.y, month.m)
          .flat()
          .map((date, i) => {
            if (!date) return <span key={i} />;
            const m = days.get(date);
            const future = date > today;
            const status = m && m.kcal > 0 ? dayStatus(m.kcal, t.kcal) : 'empty';
            return (
              <button
                key={date}
                type="button"
                className={`cal-day ${status}${date === today ? ' today' : ''}`}
                disabled={future}
                aria-label={`${date}: ${m ? `${r(m.kcal)} kcal, ${r(m.protein)} g protein` : 'nothing logged'}`}
                onClick={() => onPickDay(date)}>
                <span className="cal-num">{Number(date.slice(8))}</span>
                {m && m.kcal > 0 && <span className="cal-kcal">{r(m.kcal)}</span>}
                {m && proteinHit(m.protein, t.protein) && <span className="cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
      </div>
      <p className="small muted cal-legend">
        <span className="cal-swatch on" /> on target (±10%) <span className="cal-swatch under" /> under <span className="cal-swatch over" /> over
        <span className="cal-dot inline" /> protein hit
      </p>

      {stats.logged === 0 ? (
        <EmptyState text="Nothing logged this month." />
      ) : (
        <div className="card">
          <span className="label">This month · {stats.logged} days logged</span>
          <div className="row">
            <Stat value={`${r(stats.avg.kcal)}`} label={`avg kcal / ${t.kcal}`} />
            <Stat value={`${r(stats.avg.protein)} g`} label={`avg protein / ${t.protein}`} />
          </div>
          <div className="row">
            <Stat value={`${r(stats.avg.carbs)} g`} label={`avg carbs / ${t.carbs}`} />
            <Stat value={`${r(stats.avg.fat)} g`} label={`avg fat / ${t.fat}`} />
          </div>
          <div className="row">
            <Stat value={`${stats.onTarget} / ${stats.logged}`} label="days on calories" />
            <Stat value={`${stats.proteinHit} / ${stats.logged}`} label="days protein hit" />
          </div>
        </div>
      )}
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <div className="small muted">{label}</div>
    </div>
  );
}
