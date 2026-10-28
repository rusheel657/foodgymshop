import Storage from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';

// Device-local (not synced): each phone keeps its own theme. Dark is the default.
export type ThemePref = 'dark' | 'light';

export function getThemePref(): ThemePref {
  return Storage.getItemSync('theme') === 'light' ? 'light' : 'dark';
}

export function setThemePref(pref: ThemePref) {
  Storage.setItemSync('theme', pref);
  Appearance.setColorScheme(pref);
}
