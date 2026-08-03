/**
 * WHAT A FAILED RESPONSE MEANS (F804) — the pure half of the api client's
 * response interceptor, so the policy can be proved without a device.
 *
 * The interceptor used to test two ad-hoc conditions inline and let everything
 * else fall through to the generic failure modal. The hole that mattered: 401
 * had no branch at all, so an expired/revoked session degraded the app to
 * anonymous forever. Naming the outcomes makes that hole unrepresentable — every
 * failure now resolves to exactly one of these, and adding a status means adding
 * a case here, in one place, with a spec.
 */
export type ApiFailureAction =
  /** The session is dead: announce the lapse, route to sign-in. */
  | { kind: 'session_lapse' }
  /** Entitlement wall: announce the lapse, the paywall takeover handles it. */
  | { kind: 'entitlement_lapse' }
  /** The server is unwell: the system-status banner owns this one. */
  | { kind: 'service_issue' }
  /** Everything else — the caller's own error handling. */
  | { kind: 'caller_owned' };

export const resolveApiFailureAction = (failure: {
  status: number | undefined;
  errorCode: string | undefined;
}): ApiFailureAction => {
  const { status, errorCode } = failure;
  if (status === 401) {
    // Every 401 is a session verdict. There is no "401 that means something
    // else" on this API: authentication is the only thing it denies.
    return { kind: 'session_lapse' };
  }
  if (status === 403 && errorCode === 'ENTITLEMENT_REQUIRED') {
    return { kind: 'entitlement_lapse' };
  }
  if (typeof status === 'number' && status >= 500) {
    return { kind: 'service_issue' };
  }
  return { kind: 'caller_owned' };
};
