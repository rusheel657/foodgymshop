import { useEffect, useState } from 'react';

import { ymd } from '@/lib/history';

// Beta: AI requests made from this phone today, to see how close you get to Gemini's limits.
// shortcut: counts this device only and Gemini's real quota isn't readable from its API; a server-side ai_calls table fixes both.
export const AI_DAILY_BUDGET = 100;

type Usage = { day: string; count: number; limitedAt: string | null };

const read = (): Usage => {
  try {
    const u = JSON.parse(localStorage.getItem('ai-usage') ?? '') as Usage;
    if (u.day === ymd(new Date())) return u;
  } catch {
    // none yet, or storage blocked
  }
  return { day: ymd(new Date()), count: 0, limitedAt: null };
};

/** Records one AI request; `status` 429 means Gemini's daily limit was hit. */
export function noteAi(status: number | undefined) {
  const u = read();
  if (status === undefined || status === 401 || status === 400) return; // offline, signed out or a bad request: Gemini wasn't asked
  const next = { ...u, count: u.count + 1, limitedAt: status === 429 ? new Date().toISOString() : u.limitedAt };
  try {
    localStorage.setItem('ai-usage', JSON.stringify(next));
  } catch {
    // storage blocked: nothing to show
  }
  window.dispatchEvent(new Event('aiusage'));
}

export function useAiUsage() {
  const [u, setU] = useState(read);
  useEffect(() => {
    const update = () => setU(read());
    window.addEventListener('aiusage', update);
    return () => window.removeEventListener('aiusage', update);
  }, []);
  return u;
}
