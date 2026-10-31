import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { EmptyState, ListRow } from '@/components/ui';
import { listFoods, listMeals } from '@/db/diet';
import { dailyTotals, listLogs, logTimeFor, type FoodLog } from '@/db/log';
import { localDate, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { addDays, dayStatus, streak, weekOf } from '@/lib/history';
import { animate } from '@/lib/motion';
import { useNav } from '@/lib/nav';
import { macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { addPhoto, canUseCamera, photoSrc } from '@/lib/photos';
import { useLive } from '@/lib/use-live';
import { MyDietScreen } from '@/screens/diet';
import { HistoryScreen } from '@/screens/history';
import { AtHomeScreen, SuggestScreen } from '@/screens/home';
import { AnalyzeScreen, LogFormScreen, newLog } from '@/screens/log';
import { ShoppingScreen, useShopping } from '@/screens/shop';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LOG_TABLES = ['food_logs', 'food_log_items'];

// Small filled glyphs (24×24) for the cards.
const ICONS = {
  flame: 'M12 2.5c.8 3.2 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-4.8.1 1.8 1 3 2.3 3.3-.6-3.4-.3-6.3.3-9z',
  protein: 'M15.5 3a5.5 5.5 0 0 1 .9 10.9l-2.6.4-4.2 4.2a2.3 2.3 0 1 1-3.4 2.6 2.3 2.3 0 1 1 2.6-3.4l4.2-4.2.4-2.6A5.5 5.5 0 0 1 15.5 3z',
  carbs: 'M11 21V11.5C8.6 11 7 9 7 6.5c2.4.3 4 2 4 4.6V9.6C8.8 9 7.4 7.1 7.6 4.8 9.8 5.2 11 7 11 9.3V3h2v6.3c0-2.3 1.2-4.1 3.4-4.5.2 2.3-1.2 4.2-3.4 4.8v1.5c0-2.6 1.6-4.3 4-4.6 0 2.5-1.6 4.5-4 5V21z',
  fat: 'M12 2.8s6.5 7.2 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 10 12 2.8 12 2.8z',
};

function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'glyph'} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** A progress ring; children are centred inside it. */
function Ring({ value, max, size, stroke, className, dashed, children }: {
  value: number; max: number; size: number; stroke: number; className?: string; dashed?: boolean; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, max > 0 ? Math.max(0, value / max) : 0);
  return (
    <span className={`ring-wrap ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className={dashed ? 'ring-track dashed' : 'ring-track'} strokeWidth={stroke} />
        {f > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="ring-fill"
            strokeWidth={stroke}
            style={{ strokeDasharray: c, strokeDashoffset: c * (1 - f), '--c': c } as CSSProperties}
          />
        )}
      </svg>
      {children && <span className="ring-center">{children}</span>}
    </span>
  );
}

export function FoodScreen() {
  const { profile } = useAccount();
  const nav = useNav();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState(false);
  const week = weekOf(date);
  const logs = useLive(() => listLogs(date), LOG_TABLES, [date]);
  const days = useLive(() => dailyTotals(addDays(today, -120), addDays(today, 1)), LOG_TABLES, [today]);
  const weekDays = useLive(() => dailyTotals(week[0], addDays(week[6], 1)), LOG_TABLES, [week[0]]);
  const counts = useLive(async () => {
    const foods = await listFoods();
    return { foods: foods.length, home: foods.filter((f) => f.atHome).length, meals: (await listMeals()).length };
  }, ['foods', 'meals']);
  const swipe = useRef<number | null>(null);
  const shopping = useShopping();
  if (!profile || !logs || !days || !weekDays) return null;

  const t = targetsFor(profile);
  const eaten = sumMacros(logs.flatMap((l) => l.items.map((i) => macrosFor(i.per100, i.grams))));
  const left = Math.round(t.kcal - eaten.kcal);
  const loggedAt = logTimeFor(date, today);
  const streakDays = streak((d) => (days.get(d)?.kcal ?? 0) > 0, today);
  const go = (d: string) => d <= today && d !== date && animate('fade', () => setDate(d));
  const remaining: Macros = { kcal: t.kcal - eaten.kcal, protein: t.protein - eaten.protein, carbs: t.carbs - eaten.carbs, fat: t.fat - eaten.fat };

  async function photo(from: 'camera' | 'gallery') {
    setSheet(false);
    if (!navigator.onLine) return alert('No connection. Use Quick add instead.');
    try {
      const uri = await addPhoto(from);
      if (uri) nav.push(<AnalyzeScreen photo={uri} loggedAt={loggedAt} />);
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) alert((e as Error).message);
    }
  }
  const open = (page: ReactNode) => {
    setSheet(false);
    nav.push(page);
  };

  return (
    <main className="screen food">
      <header className="food-head">
        <div>
          <h1>{date === today ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long' })}</h1>
          <p className="muted">{new Date(`${date}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'long' })}</p>
        </div>
        <span className="streak" aria-label={`${streakDays} day logging streak`}>
          <Glyph d={ICONS.flame} className="glyph flame" />
          {streakDays}
        </span>
      </header>

      <div
        className="week"
        onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (swipe.current ?? e.changedTouches[0].clientX);
          if (Math.abs(dx) > 50) go(addDays(date, dx > 0 ? -7 : Math.min(7, Math.max(0, daysBetween(date, today)))));
          swipe.current = null;
        }}>
        {week.map((d) => {
          const m = weekDays.get(d);
          const kcal = m?.kcal ?? 0;
          const status = kcal > 0 ? dayStatus(kcal, t.kcal) : 'empty';
          return (
            <button
              key={d}
              type="button"
              className={`week-day ${status}`}
              aria-pressed={d === date}
              disabled={d > today}
              aria-label={`${d}: ${kcal ? `${Math.round(kcal)} kcal` : 'nothing logged'}`}
              onClick={() => go(d)}>
              <span className="small">{new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'short' })}</span>
              <Ring value={kcal} max={t.kcal} size={38} stroke={3} dashed={!kcal}>
                <span className="week-num">{Number(d.slice(8))}</span>
              </Ring>
            </button>
          );
        })}
      </div>

      <section className="cal-card">
        <div>
          <p className="big-num">
            {Math.round(eaten.kcal)}
            <span className="muted">/{t.kcal}</span>
          </p>
          <p className="muted">Calories eaten</p>
          <span className={left >= 0 ? 'chip' : 'chip over'}>{left >= 0 ? `${left} left` : `${-left} over`}</span>
        </div>
        <Ring value={eaten.kcal} max={t.kcal} size={112} stroke={10} className={left < 0 ? 'kcal-ring over' : 'kcal-ring'}>
          <Glyph d={ICONS.flame} className="glyph big" />
        </Ring>
      </section>

      <div className="macro-cards">
        <MacroCard label="Protein" value={eaten.protein} max={t.protein} icon={ICONS.protein} kind="protein" />
        <MacroCard label="Carbs" value={eaten.carbs} max={t.carbs} icon={ICONS.carbs} kind="carbs" />
        <MacroCard label="Fat" value={eaten.fat} max={t.fat} icon={ICONS.fat} kind="fat" />
      </div>

      {date === today && shopping?.needed && (
        <button type="button" className="shop-alert as-button" onClick={() => nav.push(<ShoppingScreen />)}>
          <span className="shop-alert-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01" />
            </svg>
          </span>
          <span>
            <strong>Time to go shopping</strong>
            <span className="small block">
              Short on {new Intl.ListFormat('en-GB').format((['protein', 'carbs', 'fat'] as const).filter((k) => shopping.short[k] >= t[k] * 0.1))} by tomorrow. See what to buy
            </span>
          </span>
        </button>
      )}

      <section className="stack-sm">
        <h2 className="section-title">{date === today ? "Today's food" : 'Food'}</h2>
        {logs.length === 0 && <EmptyState text="Nothing logged yet. Tap + to add a meal." />}
        {[...logs].reverse().map((l) => (
          <EntryCard key={l.id} log={l} onClick={() => nav.push(<LogFormScreen log={l} />)} />
        ))}
      </section>

      <div className="list">
        <ListRow title="My Diet" subtitle={counts && `${plural(counts.foods, 'food')} · ${plural(counts.meals, 'meal')}`} onClick={() => nav.push(<MyDietScreen />)} />
        <ListRow title="At home" subtitle={counts && `${plural(counts.home, 'food')} in the kitchen`} onClick={() => nav.push(<AtHomeScreen />)} />
        <ListRow
          title="History"
          subtitle="Calendar of past days"
          onClick={() => nav.push(<HistoryScreen onPickDay={(d) => { setDate(d); nav.pop(); window.scrollTo(0, 0); }} />)}
        />
      </div>

      <button type="button" className="fab" aria-label="Add food" onClick={() => setSheet(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-label="Add food" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" />
            <div className="sheet-grid">
              {canUseCamera && <SheetAction label="Scan meal" icon="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0" onClick={() => photo('camera')} />}
              {canUseCamera && <SheetAction label="From gallery" icon="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01" onClick={() => photo('gallery')} />}
              <SheetAction label="Quick add" icon="M5 6h14M5 12h14M5 18h9" onClick={() => open(<LogFormScreen log={newLog(loggedAt)} isNew />)} />
              <SheetAction label="What should I eat?" icon="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" onClick={() => open(<SuggestScreen remaining={remaining} loggedAt={loggedAt} />)} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00`) - Date.parse(`${a}T12:00`)) / 86_400_000);

function MacroCard({ label, value, max, icon, kind }: { label: string; value: number; max: number; icon: string; kind: string }) {
  return (
    <div className={`macro-card ${kind}`}>
      <p>
        <strong>{Math.round(value)}</strong>
        <span className="muted small">/{max}g</span>
      </p>
      <p className="muted small">{label} eaten</p>
      <Ring value={value} max={max} size={64} stroke={7}>
        <Glyph d={icon} />
      </Ring>
    </div>
  );
}

function EntryCard({ log, onClick }: { log: FoodLog; onClick: () => void }) {
  const m = sumMacros(log.items.map((i) => macrosFor(i.per100, i.grams)));
  const time = new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const r = Math.round;
  return (
    <button type="button" className="entry" onClick={onClick}>
      {log.photoPath && <img className="entry-photo" src={photoSrc(log.photoPath)} alt="" />}
      <span className="entry-body">
        <span className="entry-top">
          <span className="entry-name">{log.items.map((i) => i.name).join(', ')}</span>
          <span className="small muted">{time}</span>
        </span>
        <span className="entry-kcal">
          <Glyph d={ICONS.flame} />
          {r(m.kcal)} calories
          {log.items.some((i) => !i.verified) && <span className="tag">UNVERIFIED</span>}
        </span>
        <span className="entry-macros small">
          <span className="protein"><Glyph d={ICONS.protein} />{r(m.protein)}g</span>
          <span className="carbs"><Glyph d={ICONS.carbs} />{r(m.carbs)}g</span>
          <span className="fat"><Glyph d={ICONS.fat} />{r(m.fat)}g</span>
        </span>
      </span>
    </button>
  );
}

function SheetAction({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button type="button" className="sheet-action" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={icon} />
      </svg>
      {label}
    </button>
  );
}
