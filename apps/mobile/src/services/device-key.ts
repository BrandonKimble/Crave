/**
 * Keychain-persisted install identity (vote-integrity ladder,
 * plans/vote-integrity-ladder.md): a random UUID minted once per install,
 * stored in the iOS keychain / Android keystore via expo-secure-store, and
 * sent as the best-effort `x-device-key` header on every API request. The
 * server joins it into user_devices so "one device carries N accounts"
 * becomes a GROUP BY — a clustering SIGNAL, never a gate.
 *
 * Contract: NEVER throws and never blocks a request on failure — secure-store
 * unavailability (locked keychain, managed devices, unit tests) degrades to
 * null and the header is simply omitted.
 */
import * as SecureStore from 'expo-secure-store';

// §16 class: K7 plumbing constant — a stable storage key name, not a tuned
// value; changing it would mint every install a fresh identity (don't).
const DEVICE_KEY_STORAGE_KEY = 'crave.device-key.v1';

let cachedDeviceKey: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

/** RFC4122-shaped random UUID with NO Math.random fallback: the global
 *  WebCrypto (randomUUID, else getRandomValues). Null when neither exists —
 *  a fabricated weak id would poison the clustering signal (no-fake-values).
 *  NOTE: expo-crypto deliberately NOT required — it isn't in package.json and
 *  Metro resolves require() statically, so a "guarded" require of a missing
 *  module still breaks the bundle. */
const generateUuid = (): string | null => {
  try {
    const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
    if (typeof webCrypto?.randomUUID === 'function') {
      return webCrypto.randomUUID();
    }
    if (typeof webCrypto?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      webCrypto.getRandomValues(bytes);
      // RFC4122 v4 bit twiddling.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
        .slice(6, 8)
        .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }
  } catch {
    // No usable entropy source.
  }
  return null;
};

/**
 * Resolve (lazily minting) the install's device key. Module-scope cached, so
 * only the first call per session touches the keychain. Returns null on any
 * failure — callers omit the header.
 */
export const getOrCreateDeviceKey = async (): Promise<string | null> => {
  if (cachedDeviceKey !== undefined) {
    return cachedDeviceKey;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const existing = await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY);
      if (existing) {
        cachedDeviceKey = existing;
        return existing;
      }
      const minted = generateUuid();
      if (!minted) {
        // Don't cache null-from-no-entropy permanently? We do: retrying per
        // request would hammer a broken environment for the same answer.
        cachedDeviceKey = null;
        return null;
      }
      await SecureStore.setItemAsync(DEVICE_KEY_STORAGE_KEY, minted);
      cachedDeviceKey = minted;
      return minted;
    } catch {
      // Secure-store failure — best-effort header, never an error surface.
      cachedDeviceKey = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};
