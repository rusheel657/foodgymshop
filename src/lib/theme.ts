import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** 'auto' follows the phone's light/dark setting, as RSHabits does. */
export type ThemePref = 'dark' | 'light' | 'auto';

const dark = window.matchMedia('(prefers-color-scheme: dark)');

// Per-device setting, so localStorage is enough. Before Auto existed the default was dark, so saved choices stay.
export function getThemePref(): ThemePref {
  const t = localStorage.getItem('theme');
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function applyTheme(pref = getThemePref()) {
  localStorage.setItem('theme', pref);
  localStorage.removeItem('skin'); // colour themes are gone
  const shown = pref === 'auto' ? (dark.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = shown;
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: shown === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
  }
}

dark.addEventListener('change', () => getThemePref() === 'auto' && applyTheme('auto'));
