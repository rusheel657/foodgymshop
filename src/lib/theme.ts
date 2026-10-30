import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemePref = 'dark' | 'light';

/** Colour themes (data-skin on <html>; styles in themes.css). Special ones restyle the whole app and bring effects. */
export const SKINS = {
  default: { name: 'Default', kind: 'default', swatch: 'linear-gradient(135deg, #fff 0 50%, #000 50%)' },
  red: { name: 'Red', kind: 'simple', swatch: '#ff4d5e' },
  blue: { name: 'Blue', kind: 'simple', swatch: '#3b82f6' },
  pink: { name: 'Pink', kind: 'simple', swatch: '#ff5fa2' },
  green: { name: 'Green', kind: 'simple', swatch: '#22c55e' },
  orange: { name: 'Orange', kind: 'simple', swatch: '#ff8a1f' },
  yellow: { name: 'Yellow', kind: 'simple', swatch: '#ffc928' },
  gold: { name: 'Gold', kind: 'special', swatch: 'linear-gradient(135deg, #0b0906 0%, #3a2a0c 45%, #f7d774 80%, #c9962e 100%)', blurb: 'Black and gold, glittering dust' },
  lightning: { name: 'Lightning', kind: 'special', swatch: 'linear-gradient(135deg, #05060f 0%, #1b1f5e 50%, #5ee7ff 80%, #a26bff 100%)', blurb: 'Neon glow and real lightning strikes' },
  fire: { name: 'Fire', kind: 'special', swatch: 'linear-gradient(160deg, #0c0302 0%, #5c0a04 45%, #ff4d00 75%, #ffb000 100%)', blurb: 'Molten glow with rising embers' },
  ice: { name: 'Ice', kind: 'special', swatch: 'linear-gradient(160deg, #f4faff 0%, #cfe6fb 45%, #7cc4f5 75%, #818cf8 100%)', blurb: 'Frosted glass and falling snow' },
} as const;

export type Skin = keyof typeof SKINS;

// Per-device settings, so localStorage is enough.
export function getThemePref(): ThemePref {
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

export function getSkin(): Skin {
  const s = localStorage.getItem('skin');
  return s && s in SKINS ? (s as Skin) : 'default';
}

/** Special themes bring their own light/dark look. */
export const isSpecial = (skin: Skin) => SKINS[skin].kind === 'special';

export function applyTheme(pref = getThemePref(), skin = getSkin()) {
  localStorage.setItem('theme', pref);
  localStorage.setItem('skin', skin);
  document.documentElement.dataset.theme = pref;
  document.documentElement.dataset.skin = skin;
  window.dispatchEvent(new Event('skinchange'));
  const light = isSpecial(skin) ? skin === 'ice' : pref === 'light';
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
  }
}
