import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemePref = 'dark' | 'light';

// Per-device setting, so localStorage is enough.
export function getThemePref(): ThemePref {
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(pref = getThemePref()) {
  localStorage.setItem('theme', pref);
  document.documentElement.dataset.theme = pref;
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: pref === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  }
}
