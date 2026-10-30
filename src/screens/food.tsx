import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { EmptyState } from '@/components/ui';
import { listFoods, listMeals } from '@/db/diet';
import { dailyTotals, listLogs, logTimeFor, type FoodLog } from '@/db/log';
import { localDate, targetsFor } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { tap } from '@/lib/haptics';
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LOG_TABLES = ['food_logs', 'food_log_items'];
const fmt = (n: number) => Math.round(n).toLocaleString();

// 24×24 glyphs: filled ones for the flame, stroked ones inside the iOS-style icon tiles.
const FLAME = 'M12 2.5c.8 3.2 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-4.8.1 1.8 1 3 2.3 3.3-.6-3.4-.3-6.3.3-9z';
const TILE = {
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z',
  diet: 'M7 2v9a2 2 0 0 0 2 2v9M11 2v9M9 2v6M17 2c-2 2-2 6 0 8v12',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  history: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  photo: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  quick: 'M5 6h14M5 12h14M5 18h9',
  meal: 'M4 13a8 8 0 0 0 16 0zM3 13h18M9 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4',
};

function Tile({ icon, tone }: { icon: string; tone: string }) {
  return (
    <span className="tile" style={{ background: `var(--${tone})` }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={icon} />
      </svg>
    </span>
  );
}

/** Calorie ring split into where the calories came from (protein, carbs, fat), against the day's target. */
function EnergyRing({ eaten, target, size = 128, stroke = 12 }: { eaten: Macros; target: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const parts = [
    { kcal: eaten.protein * 4, tone: 'protein' },
    { kcal: eaten.carbs * 4, tone: 'carbs' },
    { kcal: eaten.fat * 9, tone: 'fat' },
  ];
  const sum = parts.reduce((s, p) => s + p.kcal, 0) || 1;
  // Arcs share the eaten fraction in proportion to each macro's calories; small gaps keep them distinct.
  const filled = Math.min(1, target > 0 ? eaten.kcal / target : 0) * c;
  const gap = filled > 24 ? 3 : 0;
  let start = 0;
  return (
    <span className="ring-wrap energy" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        {parts.map((p) => {
          const len = Math.max(0, (filled * p.kcal) / sum - gap);
          const arc = (
            <circle
              key={p.tone}
              cx={size / 2}
              cy={size / 2}
              r={r}
              className="ring-arc"
              stroke={`var(--${p.tone})`}
              strokeWidth={stroke}
              style={{ strokeDasharray: `${len} ${c}`, strokeDashoffset: -start, '--len': len, '--c': c } as CSSProperties}
            />
          );
          start += len + gap;
          return len > 0 ? arc : null;
        })}
      </svg>
      <span className="ring-center energy-center">
        <strong>{target > 0 ? Math.round((eaten.kcal / target) * 100) : 0}%</strong>
        <span className="small muted">of goal</span>
      </span>
    </span>
  );
}

function MacroBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const f = Math.min(1, max > 0 ? value / max : 0);
  const left = Math.round(max - value);
  return (
    <div className="macro-row">
      <div className="macro-row-top">
        <span>
          <span className="dot" style={{ background: `var(--${tone})` }} />
          {label}
        </span>
        <span className="small">
          <strong>{Math.round(value)}</strong>
          <span className="muted"> / {max} g</span>
        </span>
      </div>
      <div className="capsule" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemax={max}>
        <div style={{ transform: `scaleX(${f})`, background: `var(--${tone})` }} />
      </div>
      <span className="small muted">{left > 0 ? `${left} g to go` : left === 0 ? 'Done' : `${-left} g over`}</span>
    </div>
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
  if (!profile || !logs || !days || !weekDays) return null;

  const t = targetsFor(profile);
  const eaten = sumMacros(logs.flatMap((l) => l.items.map((i) => macrosFor(i.per100, i.grams))));
  const left = Math.round(t.kcal - eaten.kcal);
  const loggedAt = logTimeFor(date, today);
  const streakDays = streak((d) => (days.get(d)?.kcal ?? 0) > 0, today);
  const remaining: Macros = { kcal: t.kcal - eaten.kcal, protein: t.protein - eaten.protein, carbs: t.carbs - eaten.carbs, fat: t.fat - eaten.fat };
  const go = (d: string) => {
    if (d > today || d === date) return;
    tap();
    animate('fade', () => setDate(d));
  };
  const longDate = new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

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
          <p className="eyebrow">{longDate}</p>
          <h1>{date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long' })}</h1>
        </div>
        <span className="streak" aria-label={`${streakDays} day logging streak`}>
          <svg viewBox="0 0 24 24" className="flame" aria-hidden="true">
            <path d={FLAME} />
          </svg>
          {streakDays}
        </span>
      </header>

      <div
        className="week"
        onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (swipe.current ?? e.changedTouches[0].clientX);
          if (Math.abs(dx) > 50) go(dx > 0 ? addDays(date, -7) : [addDays(date, 7), today].sort()[0]);
          swipe.current = null;
        }}>
        {week.map((d) => {
          const kcal = weekDays.get(d)?.kcal ?? 0;
          return (
            <button
              key={d}
              type="button"
              className={`week-day${d === today ? ' today' : ''}`}
              aria-pressed={d === date}
              disabled={d > today}
              aria-label={`${d}: ${kcal ? `${Math.round(kcal)} kcal` : 'nothing logged'}`}
              onClick={() => go(d)}>
              <span className="week-letter">{new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'narrow' })}</span>
              <span className="week-num">{Number(d.slice(8))}</span>
              <span className={`week-dot ${kcal > 0 ? dayStatus(kcal, t.kcal) : ''}`} />
            </button>
          );
        })}
      </div>

      <section className="summary">
        <div className="summary-top">
          <div>
            <p className="eyebrow">Calories</p>
            <p className="big-num">{fmt(eaten.kcal)}</p>
            <p className="muted">of {fmt(t.kcal)} kcal</p>
            <span className={left >= 0 ? 'pill' : 'pill over'}>{left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`}</span>
          </div>
          <EnergyRing eaten={eaten} target={t.kcal} />
        </div>
        <div className="macro-rows">
          <MacroBar label="Protein" value={eaten.protein} max={t.protein} tone="protein" />
          <MacroBar label="Carbs" value={eaten.carbs} max={t.carbs} tone="carbs" />
          <MacroBar label="Fat" value={eaten.fat} max={t.fat} tone="fat" />
        </div>
      </section>

      <div className="list">
        <TileRow icon={TILE.idea} tone="orange" title="What should I eat?" subtitle={`Ideas from ${plural(counts?.home ?? 0, 'food')} at home`} onClick={() => nav.push(<SuggestScreen remaining={remaining} loggedAt={loggedAt} />)} />
      </div>

      <section className="group">
        <h2 className="group-title">Meals</h2>
        {logs.length === 0 ? (
          <EmptyState text="Nothing logged yet. Tap + to add a meal." />
        ) : (
          <div className="list">
            {[...logs].reverse().map((l) => (
              <MealRow key={l.id} log={l} onClick={() => nav.push(<LogFormScreen log={l} />)} />
            ))}
          </div>
        )}
      </section>

      <section className="group">
        <h2 className="group-title">More</h2>
        <div className="list">
          <TileRow icon={TILE.diet} tone="accent" title="My Diet" subtitle={counts && `${plural(counts.foods, 'food')} · ${plural(counts.meals, 'meal')}`} onClick={() => nav.push(<MyDietScreen />)} />
          <TileRow icon={TILE.home} tone="orange" title="At home" subtitle={counts && `${plural(counts.home, 'food')} in the kitchen`} onClick={() => nav.push(<AtHomeScreen />)} />
          <TileRow
            icon={TILE.history}
            tone="blue"
            title="History"
            subtitle="Calendar of past days"
            onClick={() => nav.push(<HistoryScreen onPickDay={(d) => { setDate(d); nav.pop(); window.scrollTo(0, 0); }} />)}
          />
        </div>
      </section>

      <button type="button" className="fab" aria-label="Add food" onClick={() => { tap(); setSheet(true); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="action-sheet" role="dialog" aria-label="Add food" onClick={(e) => e.stopPropagation()}>
            <div className="list">
              <p className="sheet-title small muted">Add to {date === today ? 'today' : longDate}</p>
              {canUseCamera && <TileRow icon={TILE.camera} tone="blue" title="Scan meal" subtitle="AI reads your plate" onClick={() => photo('camera')} />}
              {canUseCamera && <TileRow icon={TILE.photo} tone="purple" title="Choose photo" subtitle="From your gallery" onClick={() => photo('gallery')} />}
              <TileRow icon={TILE.quick} tone="muted" title="Quick add" subtitle="Pick foods or a saved meal" onClick={() => open(<LogFormScreen log={newLog(loggedAt)} isNew />)} />
              <TileRow icon={TILE.idea} tone="orange" title="What should I eat?" subtitle="Hit the rest of today's macros" onClick={() => open(<SuggestScreen remaining={remaining} loggedAt={loggedAt} />)} />
            </div>
            <button type="button" className="sheet-cancel" onClick={() => setSheet(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function TileRow({ icon, tone, title, subtitle, onClick }: { icon: string; tone: string; title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button type="button" className="list-row has-tile" onClick={onClick}>
      <Tile icon={icon} tone={tone} />
      <span className="grow">
        <span className="list-title">{title}</span>
        {subtitle && <span className="small muted">{subtitle}</span>}
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function MealRow({ log, onClick }: { log: FoodLog; onClick: () => void }) {
  const m = sumMacros(log.items.map((i) => macrosFor(i.per100, i.grams)));
  const time = new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const r = Math.round;
  return (
    <button type="button" className="list-row meal-row" onClick={onClick}>
      {log.photoPath ? <img className="meal-thumb" src={photoSrc(log.photoPath)} alt="" /> : <Tile icon={TILE.meal} tone="element-2" />}
      <span className="grow">
        <span className="list-title">{log.items.map((i) => i.name).join(', ')}</span>
        <span className="meal-line">
          <strong>{fmt(m.kcal)} kcal</strong>
          <span className="mini protein">P {r(m.protein)}</span>
          <span className="mini carbs">C {r(m.carbs)}</span>
          <span className="mini fat">F {r(m.fat)}</span>
        </span>
        {log.items.some((i) => !i.verified) && <span className="ai-badge">AI estimate</span>}
      </span>
      <span className="small muted meal-time">{time}</span>
    </button>
  );
}
