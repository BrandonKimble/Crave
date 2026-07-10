/**
 * RevenueCat wrapper (plans/payments-ideal-shape.md step 5, red-team
 * hardened 2026-07-08).
 *
 * Design constraints baked in:
 * - app_user_id = the CLERK user id, always — that's how the RC webhook maps
 *   purchases back to our user. Identity transitions are SERIALIZED through
 *   one promise queue, and purchases are refused unless the RC identity is a
 *   confirmed, current Clerk user (an anonymous purchase can never be mapped
 *   server-side: user charged, no entitlement).
 * - RC is receipt-validation + store truth ONLY. ACCESS truth is the server
 *   ledger (UserProfile.access) — UI must never gate on CustomerInfo.
 * - react-native-purchases is a NATIVE module: the JS package always loads,
 *   so the unlinked-binary failure surfaces at configure() call time — that
 *   call is guarded and flips availability off instead of crashing.
 * - A production (non-__DEV__) build with a Test Store key ('test_...')
 *   refuses to enable purchases and logs loudly: shipping the Test Store to
 *   App Review is an automatic rejection.
 */
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

type PurchasesModule = typeof import('react-native-purchases').default;

let purchasesModule: PurchasesModule | null = null;
/** The Clerk user id RC is currently configured as (null = not configured
 *  or signed out — purchases refused). */
let activeUserId: string | null = null;
let configureFailed = false;
/** All identity mutations chain through this queue so an interleaved
 *  logOut/logIn can never leave RC pointing at the wrong (or anonymous)
 *  identity while the app believes otherwise. */
let identityQueue: Promise<void> = Promise.resolve();

function loadModule(): PurchasesModule | null {
  if (purchasesModule) return purchasesModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require('react-native-purchases') as {
      default: PurchasesModule;
    };
    purchasesModule = loaded.default;
    return purchasesModule;
  } catch {
    // JS package absent entirely (shouldn't happen once installed).
    return null;
  }
}

function getApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (!key) return undefined;
  if (!__DEV__ && key.startsWith('test_')) {
    // eslint-disable-next-line no-console
    console.error(
      '[purchases] RELEASE build carries a RevenueCat TEST STORE key — ' +
        'purchases disabled. Ship the appl_ production key.'
    );
    return undefined;
  }
  return key;
}

/** True when the SDK is linked, configured for a signed-in user, and the
 *  key is valid for this build type. UI shows real purchase controls only
 *  when this is true. */
export function isPurchasesAvailable(): boolean {
  return activeUserId !== null && !configureFailed;
}

function enqueueIdentity(op: () => Promise<void>): Promise<void> {
  identityQueue = identityQueue.then(op, op);
  return identityQueue;
}

/** Point RC at this Clerk user. Serialized; safe to call on every auth
 *  change. On an unlinked native module the failure is contained here and
 *  availability stays false. */
export function configurePurchases(clerkUserId: string): Promise<void> {
  return enqueueIdentity(async () => {
    const Purchases = loadModule();
    const apiKey = getApiKey();
    if (!Purchases || !apiKey) return;
    try {
      if (activeUserId === null && !configureFailed) {
        Purchases.configure({ apiKey, appUserID: clerkUserId });
      } else if (activeUserId !== clerkUserId) {
        await Purchases.logIn(clerkUserId);
      }
      activeUserId = clerkUserId;
      configureFailed = false;
    } catch (error) {
      configureFailed = true;
      activeUserId = null;
      // eslint-disable-next-line no-console
      console.warn(
        '[purchases] configure/logIn failed (native module missing or SDK error) — purchases disabled',
        error
      );
    }
  });
}

/** Sign-out: drop to RC anonymous AND mark purchases unavailable (an
 *  anonymous purchase can never be mapped to a user server-side). */
export function logOutPurchases(): Promise<void> {
  return enqueueIdentity(async () => {
    const Purchases = loadModule();
    const wasConfigured = activeUserId !== null;
    activeUserId = null;
    if (!Purchases || !wasConfigured) return;
    try {
      await Purchases.logOut();
    } catch {
      // already anonymous — fine
    }
  });
}

/** Current offering (the paywall's package list), or null when unavailable. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  await identityQueue;
  const Purchases = loadModule();
  if (!Purchases || !isPurchasesAvailable()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/** Run a purchase. Returns customerInfo on success, null on user-cancel.
 *  Throws on real errors — including an identity mismatch: a purchase is
 *  REFUSED unless RC is configured as the given signed-in Clerk user.
 *  NOTE: access flips when the RC webhook lands the ledger grant — callers
 *  poll the server profile, never trust this return for gating. */
export async function purchasePackage(
  pkg: PurchasesPackage,
  expectedUserId: string
): Promise<CustomerInfo | null> {
  await identityQueue;
  const Purchases = loadModule();
  if (!Purchases || !isPurchasesAvailable()) {
    throw new Error('Purchases are not available in this build');
  }
  if (activeUserId !== expectedUserId) {
    throw new Error('Purchase identity mismatch — sign-in state changed; try again');
  }
  try {
    const result = await Purchases.purchasePackage(pkg);
    return result.customerInfo;
  } catch (error) {
    const cancelled =
      typeof error === 'object' &&
      error !== null &&
      (error as { userCancelled?: boolean }).userCancelled === true;
    if (cancelled) return null;
    throw error;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  await identityQueue;
  const Purchases = loadModule();
  if (!Purchases || !isPurchasesAvailable()) return null;
  return Purchases.restorePurchases();
}
