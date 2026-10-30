import { useEffect, useRef, useState } from 'react';

import { startEffect } from '@/lib/effects';
import { getSkin, isSpecial, type Skin } from '@/lib/theme';

/** The current theme, updated when it changes anywhere in the app. */
export function useSkin(): Skin {
  const [skin, setSkin] = useState(getSkin);
  useEffect(() => {
    const update = () => setSkin(getSkin());
    window.addEventListener('skinchange', update);
    return () => window.removeEventListener('skinchange', update);
  }, []);
  return skin;
}

/** Animated layer behind the app for special themes (glitter, lightning, embers, snow). */
export function SkinEffects() {
  const skin = useSkin();
  const canvas = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const special = isSpecial(skin);

  useEffect(() => {
    if (!special || !canvas.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return startEffect(skin as 'gold' | 'lightning' | 'fire' | 'ice', canvas.current, (x) => {
      const el = flash.current;
      if (!el) return;
      el.style.setProperty('--fx-x', `${Math.round(x * 100)}%`);
      el.classList.remove('on');
      void el.offsetWidth; // restart the animation
      el.classList.add('on');
    });
  }, [skin, special]);

  if (!special) return null;
  return (
    <>
      {/* Lightning strikes cross in front of the app; the other effects stay behind the cards. */}
      <canvas ref={canvas} className={skin === 'lightning' ? 'fx over' : 'fx'} aria-hidden="true" />
      {skin === 'lightning' && <div ref={flash} className="fx-flash" aria-hidden="true" />}
    </>
  );
}
