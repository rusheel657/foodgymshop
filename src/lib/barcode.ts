import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

import { fromOpenFoodFacts, type FoodDraft } from '@/lib/nutrition';

/** Opens Google's scanner UI (no camera permission needed). Returns the code, or null if cancelled. */
export async function scanBarcode(): Promise<string | null> {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    // One-time download by Google Play services.
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error('Downloading the barcode scanner. Try again in a minute.');
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
    });
    return barcodes[0]?.rawValue ?? null;
  } catch (e) {
    if (/cancel/i.test((e as Error).message)) return null;
    throw e;
  }
}

/** Open Food Facts lookup (no key). null when the product is unknown or has no nutrition data. */
export async function lookupBarcode(code: string): Promise<FoodDraft | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);
  return fromOpenFoodFacts(code, await res.json());
}
