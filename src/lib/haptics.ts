import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** A light iOS-style tap on key presses (no-op in the browser). */
export const tap = () => {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
};
