/**
 * RevenueCat wrapper (plans/payments-ideal-shape.md step 5).
 *
 * Design constraints baked in:
 * - app_user_id = the CLERK user id, always — that's how the RC webhook maps
 *   purchases back to our user (User.revenueCatAppUserId is set to it).
 * - RC is receipt-validation + store truth ONLY. ACCESS truth is the server
 *   ledger (UserProfile.access) — UI must never gate on CustomerInfo.
 * - react-native-purchases is a NATIVE module: until the next dev-client
 *   build includes it, every call no-ops gracefully instead of crashing the
 *   JS bundle (isPurchasesAvailable() tells the UI which world it is in).
 */
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

type PurchasesModule = typeof import('react-native-purchases').default;

let purchasesModule: PurchasesModule | null = null;
let configured = false;

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
    // Native module not in this binary yet (pre-rebuild dev client).
    return null;
  }
}

export function isPurchasesAvailable(): boolean {
  return loadModule() !== null && Boolean(getApiKey());
}

function getApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
}

/** Configure RC for the signed-in user. Call on auth change; safe to call
 *  repeatedly (logIn switches the RC identity). */
export async function configurePurchases(clerkUserId: string): Promise<void> {
  const Purchases = loadModule();
  const apiKey = getApiKey();
  if (!Purchases || !apiKey) return;
  if (!configured) {
    Purchases.configure({ apiKey, appUserID: clerkUserId });
    configured = true;
  } else {
    await Purchases.logIn(clerkUserId);
  }
}

export async function logOutPurchases(): Promise<void> {
  const Purchases = loadModule();
  if (!Purchases || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // anonymous already / not configured — fine
  }
}

/** Current offering (the paywall's package list), or null when unavailable. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const Purchases = loadModule();
  if (!Purchases || !configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/** Run a purchase. Returns customerInfo on success, null on user-cancel.
 *  Throws on real errors. NOTE: access flips when the RC webhook lands the
 *  ledger grant — callers should refetch the profile, not trust this. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  const Purchases = loadModule();
  if (!Purchases || !configured) return null;
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
  const Purchases = loadModule();
  if (!Purchases || !configured) return null;
  return Purchases.restorePurchases();
}
