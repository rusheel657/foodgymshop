import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

/** A light tap for picking, ticking and toggling (does nothing in the browser). */
export const tap = () => {
  if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
};
