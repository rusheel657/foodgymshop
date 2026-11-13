import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { EntryRow, Glyph, ICONS, mainMacro } from '@/components/food-grid';
import { EmptyState, Sheet, Tile } from '@/components/ui';
import type { DayTargets } from '@/db/activity';
import { listFoods, listMeals, type Food, type Meal } from '@/db/diet';
import { dailyTotals, listLogs, logTimeFor, type FoodLog } from '@/db/log';
import { localDate } from '@/db/profile';
import { useAccount } from '@/lib/account';
import { useTargets } from '@/lib/health';
import { addDays, dayStatus, streak, weekOf } from '@/lib/history';
import { animate } from '@/lib/motion';
import { useNav } from '@/lib/nav';
import { amountLabel, macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { addPhoto, canUseCamera } from '@/lib/photos';
import { costOf, money } from '@/lib/price';
import { MEALS } from '@/lib/suggest';
import { useLive } from '@/lib/use-live';
import { MyDietScreen } from '@/screens/diet';
import { HistoryScreen } from '@/screens/history';
import { AtHomeScreen, SuggestScreen } from '@/screens/home';
import { AnalyzeScreen, LogFormScreen, QuickLogScreen } from '@/screens/log';
import { horizon, ShoppingScreen, useShopping } from '@/screens/shop';
import { SpendingScreen } from '@/screens/spending';
import { WeightScreen } from '@/screens/weight';

const LOG_TABLES = ['food_logs', 'food_log_items'];

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

/** `adding`: the add-food sheet, opened from the + in the tab bar. */
export function FoodScreen({ adding: sheet, setAdding: setSheet }: { adding: boolean; setAdding: (open: boolean) => void }) {
  const { profile } = useAccount();
  const nav = useNav();
  const today = localDate();
  const [date, setDate] = useState(today);
  const week = weekOf(date);
  const logs = useLive(() => listLogs(date), LOG_TABLES, [date]);
  const days = useLive(() => dailyTotals(addDays(today, -120), addDays(today, 1)), LOG_TABLES, [today]);
  const weekDays = useLive(() => dailyTotals(week[0], addDays(week[6], 1)), LOG_TABLES, [week[0]]);
  const counts = useLive(async () => {
    const foods = await listFoods();
    return { foods: foods.length, home: foods.filter((f) => f.atHome).length };
  }, ['foods']);
  const foods = useLive(() => listFoods(true), ['foods']); // for prices; old entries may use foods switched off since
  const meals = useLive(listMeals, ['meals', 'meal_items']);
  const swipe = useRef<number | null>(null);
  const [sources, setSources] = useState<MacroKey | null>(null);
  const shopping = useShopping();
  const targets = useTargets(week);
  if (!profile || !logs || !days || !weekDays || !targets || !foods || !meals) return null;

  const t = targets.get(date)!;
  const eaten = sumMacros(logs.flatMap((l) => l.items.map((i) => macrosFor(i.per100, i.grams))));
  const left = Math.round(t.kcal - eaten.kcal);
  const spend = costOf(logs.flatMap((l) => l.items), foods);
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
  const openHistory = () => nav.push(<HistoryScreen onPickDay={(d) => { setDate(d); nav.pop(); window.scrollTo(0, 0); }} />);
  const open = (page: ReactNode) => {
    setSheet(false);
    nav.push(page);
  };

  return (
    <main className="screen food">
      <p className="brand">RSFitness</p>
      <header className="food-head">
        <div>
          <button type="button" className="title-button" onClick={openHistory}>
            <h1>{date === today ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long' })}</h1>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <p className="muted">{new Date(`${date}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'long' })} · tap for your history</p>
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
          const dayKcal = targets.get(d)!.kcal;
          const status = kcal > 0 ? dayStatus(kcal, dayKcal) : 'empty';
          return (
            <button
              key={d}
              type="button"
              className={`week-day ${status}`}
              aria-pressed={d === date}
              disabled={d > today}
              aria-label={`${d}: ${kcal ? `${Math.round(kcal)} kcal` : 'nothing logged'}`}
              onClick={() => go(d)}>
              <span className="small">{new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'narrow' })}</span>
              <Ring value={kcal} max={dayKcal} size={40} stroke={3.5}>
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

      {t.burn && (
        <BurnCard
          t={t}
          today={date === today}
          goal={
            profile.calorieOverride !== null
              ? 'Your set calorie target'
              : `Goal: ${profile.goal} ${profile.rateKgWeek} kg a week`
          }
        />
      )}

      <div className="macro-cards">
        <MacroCard label="Protein" value={eaten.protein} max={t.protein} icon={ICONS.protein} kind="protein" onClick={() => setSources('protein')} />
        <MacroCard label="Carbs" value={eaten.carbs} max={t.carbs} icon={ICONS.carbs} kind="carbs" onClick={() => setSources('carbs')} />
        <MacroCard label="Fat" value={eaten.fat} max={t.fat} icon={ICONS.fat} kind="fat" onClick={() => setSources('fat')} />
      </div>
      {sources && <MacroSources kind={sources} logs={logs} foods={foods} today={date === today} onClose={() => setSources(null)} />}

      {date === today && shopping?.needed && (
        <button type="button" className="shop-nudge" onClick={() => nav.push(<ShoppingScreen />)}>
          <span className="shop-nudge-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01" />
            </svg>
          </span>
          <span className="grow">
            <strong>Time to go shopping</strong>
            <span className="small muted">
              Short on {new Intl.ListFormat('en-GB').format((['protein', 'carbs', 'fat'] as const).filter((k) => shopping.short[k] >= t[k] * 0.1))} by {shopping.days === 1 ? 'tomorrow' : `the end of ${horizon(shopping.days)}`}
            </span>
          </span>
          <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      <section className="stack-sm">
        <h2 className="section-title">{date === today ? "Today's food" : 'Food'}</h2>
        {logs.length === 0 && <EmptyState text="Nothing logged yet." action="Add a meal" onAction={() => setSheet(true)} />}
        {spend.cost > 0 && (
          <button
            type="button"
            className="spend-line"
            onClick={() => nav.push(<SpendingScreen date={date} onPickDay={(d) => { setDate(d); nav.pop(); window.scrollTo(0, 0); }} />)}>
            <span>
              <strong>{date === today ? 'Spent today' : 'Spent that day'}</strong>
              {spend.unpriced > 0 && <span className="small muted block">{spend.unpriced === 1 ? "1 item has no price, so it isn't counted" : `${spend.unpriced} items have no price, so they aren't counted`}</span>}
            </span>
            <strong>{money(spend.cost)} ›</strong>
          </button>
        )}
        {MEALS.map(({ label, until }, k) => {
          const from = MEALS[k - 1]?.until ?? 0;
          const group = logs.filter((l) => {
            const h = new Date(l.loggedAt).getHours();
            return h >= from && h < until;
          });
          if (group.length === 0) return null;
          const kcal = sumMacros(group.flatMap((l) => l.items.map((i) => macrosFor(i.per100, i.grams)))).kcal;
          return (
            <div key={label} className="meal-group">
              <p className="meal-group-head">
                <span>{label}</span>
                <span>{Math.round(kcal)} kcal</span>
              </p>
              {group.map((l) => (
                <EntryCard key={l.id} log={l} foods={foods} meal={meals.find((m) => m.id === l.mealId)} onClick={() => nav.push(<LogFormScreen log={l} />)} />
              ))}
            </div>
          );
        })}
      </section>

      <div className="tiles">
        <Tile label="My Diet" icon={TILE.diet} tone="green" count={counts?.foods} onClick={() => nav.push(<MyDietScreen />)} />
        <Tile label="At home" icon={TILE.home} tone="orange" count={counts?.home} onClick={() => nav.push(<AtHomeScreen />)} />
        <Tile label="Weight" icon={TILE.weight} tone="blue" count={<>{profile.weightKg}<small> kg</small></>} onClick={() => nav.push(<WeightScreen />)} />
        <Tile label="History" icon={TILE.history} tone="red" onClick={openHistory} />
      </div>

      {sheet && (
        <Sheet label="Add food" onClose={() => setSheet(false)}>
          <div className="sheet-grid">
            {canUseCamera && <SheetAction label="Scan meal" icon="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0" onClick={() => photo('camera')} />}
            {canUseCamera && <SheetAction label="From gallery" icon="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01" onClick={() => photo('gallery')} />}
            <SheetAction label="Quick add" icon="M5 6h14M5 12h14M5 18h9" onClick={() => open(<QuickLogScreen loggedAt={loggedAt} />)} />
            <SheetAction label="What should I eat?" icon="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" onClick={() => open(<SuggestScreen remaining={remaining} loggedAt={loggedAt} />)} />
          </div>
        </Sheet>
      )}
    </main>
  );
}

const TILE = {
  diet: 'M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l7-7',
  home: 'M4 11l8-6.5 8 6.5V20h-5v-6H9v6H4z',
  weight: 'M6 4h12l2 16H4zM9.5 10a2.5 2.5 0 0 1 5 0',
  history: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00`) - Date.parse(`${a}T12:00`)) / 86_400_000);

function MacroCard({ label, value, max, icon, kind, onClick }: { label: string; value: number; max: number; icon: string; kind: string; onClick: () => void }) {
  return (
    <button type="button" className={`macro-card ${kind}`} onClick={onClick} aria-label={`${label}: ${Math.round(value)} of ${max} g. See where it came from`}>
      <p>
        <strong>{Math.round(value)}</strong>
        <span className="muted small">/{max}g</span>
      </p>
      <p className="muted small">{label} eaten</p>
      <Ring value={value} max={max} size={64} stroke={7}>
        <Glyph d={icon} />
      </Ring>
    </button>
  );
}

type MacroKey = 'protein' | 'carbs' | 'fat';

/** Where a macro came from that day: each food's grams of it, most first. */
function MacroSources({ kind, logs, foods, today, onClose }: { kind: MacroKey; logs: FoodLog[]; foods: Food[]; today: boolean; onClose: () => void }) {
  const byFood = new Map<string, { key: string; name: string; grams: number; g: number; piece?: number | null }>();
  for (const i of logs.flatMap((l) => l.items)) {
    const key = i.foodId ?? i.name;
    const row = byFood.get(key) ?? { key, name: i.name, grams: 0, g: 0, piece: foods.find((f) => f.id === i.foodId)?.pieceGrams };
    row.grams += i.grams;
    row.g += macrosFor(i.per100, i.grams)[kind];
    byFood.set(key, row);
  }
  const rows = [...byFood.values()].filter((r) => r.g >= 0.5).sort((a, b) => b.g - a.g);
  const total = rows.reduce((s, r) => s + r.g, 0);
  const label = kind[0].toUpperCase() + kind.slice(1);
  return (
    <Sheet title={`${label} ${today ? 'today' : 'that day'}`} onClose={onClose}>
      <p className="muted">{rows.length ? `${Math.round(total)} g from ${rows.length === 1 ? '1 food' : `${rows.length} foods`}, most first.` : `Nothing eaten had any ${kind}.`}</p>
      <div className={`list macro-src ${kind}`}>
        {rows.map((r) => (
          <div key={r.key} className="list-row">
            <span>
              <span className="list-title">{r.name}</span>
              <span className="small muted">{amountLabel(r.grams, r.piece)} · {Math.round((r.g / total) * 100)}%</span>
            </span>
            <strong>{Math.round(r.g)} g</strong>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function EntryCard({ log, foods, meal, onClick }: { log: FoodLog; foods: Food[]; meal?: Meal; onClick: () => void }) {
  const m = sumMacros(log.items.map((i) => macrosFor(i.per100, i.grams)));
  const { cost } = costOf(log.items, foods);
  const time = new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const title = log.name || meal?.name || log.items.map((i) => i.name).join(', ');
  // Its own photo, else the saved meal's, else the first food's photo from My Diet.
  const own = log.items.flatMap((i) => foods.find((f) => f.id === i.foodId) ?? []);
  const photo = log.photoPath ?? meal?.photos[0] ?? own.find((f) => f.photo)?.photo ?? null;
  return (
    <EntryRow
      photo={photo}
      letter={title}
      tone={own[0] ? mainMacro(own[0]) : 'carbs'}
      title={title}
      side={time}
      m={m}
      extra={
        <>
          {cost > 0 && <span className="entry-cost">{money(cost)}</span>}
          {log.items.some((i) => !i.verified) && <span className="tag">UNVERIFIED</span>}
        </>
      }
      onClick={onClick}
    />
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

/** Where the day's calorie target comes from, as a plain sum: body + steps + gym = burned; ± goal = what to eat. */
function BurnCard({ t, today, goal }: { t: DayTargets; today: boolean; goal: string }) {
  const burn = t.burn!;
  const n = (v: number) => Math.round(v).toLocaleString();
  const diff = t.kcal - burn.total;
  const [open, setOpen] = useState(() => localStorage.getItem('burn-open') === '1');
  const toggle = () =>
    animate('fade', () => {
      localStorage.setItem('burn-open', open ? '0' : '1');
      setOpen(!open);
    });
  return (
    <section className={open ? 'burn-card open' : 'burn-card'}>
      <button type="button" className="burn-row burn-head" aria-expanded={open} onClick={toggle}>
        <span>
          <span className="burn-title">{today ? 'Calories today' : 'Calories that day'}</span>
          {!open && <small>You burn {n(burn.total)} · eat {n(t.kcal)}</small>}
        </span>
        <span className="burn-toggle">
          {open && <small>kcal</small>}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <>
      <div className="burn-row">
        <span>
          Your body
          <small>resting, digesting, moving about</small>
        </span>
        <b>{n(burn.base)}</b>
      </div>
      <div className="burn-row">
        <span>
          {n(burn.steps)} steps
          {today && <small>so far today, updates as you walk</small>}
        </span>
        <b>+{n(burn.stepKcal)}</b>
      </div>
      <div className="burn-row">
        <span>{burn.workoutMinutes ? `Gym · ${burn.workoutMinutes} min` : 'Gym · no workout'}</span>
        <b>+{n(burn.workoutKcal)}</b>
      </div>
      <div className="burn-row total">
        <span>You burn</span>
        <b>{n(burn.total)}</b>
      </div>
      {diff !== 0 && (
        <div className="burn-row">
          <span>{goal}</span>
          <b>
            {diff > 0 ? '+' : '−'}
            {n(Math.abs(diff))}
          </b>
        </div>
      )}
      <div className="burn-row total eat">
        <span>Eat</span>
        <b>{n(t.kcal)}</b>
      </div>
        </>
      )}
    </section>
  );
}
