import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/** Opens the camera or gallery and copies the photo into app storage. Returns its file URI, or null if cancelled. */
export async function addPhoto(from: 'camera' | 'gallery'): Promise<string | null> {
  const picked =
    from === 'camera'
      ? await Camera.takePhoto({ quality: 70, targetWidth: 1024, targetHeight: 1024, correctOrientation: true })
      : (await Camera.chooseFromGallery({ limit: 1 })).results[0];
  if (!picked?.uri) return null;
  // The camera's file lives in the cache, which Android may clear; keep our own copy.
  const { uri } = await Filesystem.copy({
    from: picked.uri,
    to: `photos/${crypto.randomUUID()}.jpg`,
    toDirectory: Directory.Data,
  });
  return uri;
}

export async function deletePhoto(uri: string) {
  await Filesystem.deleteFile({ path: uri }).catch(() => {});
}

/** URI → something an <img> can show inside the WebView. */
export const photoSrc = (uri: string) => Capacitor.convertFileSrc(uri);

export const canUseCamera = Capacitor.isNativePlatform();
