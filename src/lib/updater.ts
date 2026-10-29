import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';

// Written by .github/workflows/release.yml on every release.
const LATEST_URL = 'https://github.com/rusheel657/foodgymshop/releases/latest/download/latest.json';

type Latest = { bundle: string; native: number; bundleUrl: string; bundleSha256: string; apkUrl: string };

/** Release number baked in at build time; "dev" for local builds, which never self-update. */
export const BUNDLE = import.meta.env.VITE_BUNDLE ?? 'dev';

/**
 * Background update check. Web-code updates download silently and apply on the next app start.
 * Returns the APK URL when the update needs a new APK (native code changed), else null.
 */
export async function checkForUpdate(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  await LiveUpdate.ready(); // this bundle started fine: don't roll it back

  const res = await CapacitorHttp.get({ url: LATEST_URL });
  if (res.status !== 200) return null;
  const latest: Latest = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

  const { versionCode } = await LiveUpdate.getVersionCode();
  if (latest.native > Number(versionCode)) return latest.apkUrl;
  if (!(Number(latest.bundle) > Number(BUNDLE))) return null;

  const { bundleId: next } = await LiveUpdate.getNextBundle();
  if (next === latest.bundle) return null;
  const { bundleIds } = await LiveUpdate.getBundles();
  if (!bundleIds.includes(latest.bundle)) {
    await LiveUpdate.downloadBundle({ url: latest.bundleUrl, bundleId: latest.bundle, checksum: latest.bundleSha256 });
  }
  await LiveUpdate.setNextBundle({ bundleId: latest.bundle });
  return null;
}
