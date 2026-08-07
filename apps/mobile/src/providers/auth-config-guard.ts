import { captureHandledError } from '../observability/crash-reporting';

/**
 * F2802 — a misconfiguration that is invisible in the environment it can only
 * occur in is not guarded.
 *
 * Both Clerk-key misconfigs (a release build with NO key → the app runs fully
 * UNAUTHENTICATED; a release build carrying a `pk_test_` key → users
 * authenticate against the test instance) can ONLY happen in a release build,
 * and yet the original guards were `console.error` calls — a __DEV__-only
 * channel (see crash-reporting.ts: "Console emission is now __DEV__-only and
 * the production record lives here instead"). Sentry turns those console lines
 * into breadcrumbs that ship only attached to a later event, and the failure
 * mode here is an app that works fine and reports nothing — so no event
 * follows and the breadcrumb dies in the 60-entry ring.
 *
 * This routes each case through the crash-reporting seam with a distinct
 * `seam:` tag (the production record), keeping the console line for dev. Kept
 * as a pure function so the guard is testable without rendering the provider.
 */
export function reportClerkKeyMisconfig(publishableKey: string | undefined, isDev: boolean): void {
  if (isDev) {
    return;
  }
  if (!publishableKey) {
    captureHandledError(
      new Error(
        '[auth] RELEASE build has no EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — ' +
          'the app would run fully UNAUTHENTICATED.'
      ),
      { seam: 'auth:missing-clerk-key' }
    );
    // eslint-disable-next-line no-console
    console.error(
      '[auth] RELEASE build has no EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — ' +
        'the app would run fully UNAUTHENTICATED. Set the production ' +
        'Clerk key in EAS secrets.'
    );
    return;
  }
  if (publishableKey.startsWith('pk_test_')) {
    captureHandledError(
      new Error(
        '[auth] RELEASE build carries a Clerk TEST publishable key ' +
          '(pk_test_) — users will authenticate against the test instance.'
      ),
      { seam: 'auth:test-clerk-key' }
    );
    // eslint-disable-next-line no-console
    console.error(
      '[auth] RELEASE build carries a Clerk TEST publishable key ' +
        '(pk_test_) — users will authenticate against the test instance. ' +
        'Ship the pk_live_ key.'
    );
  }
}
