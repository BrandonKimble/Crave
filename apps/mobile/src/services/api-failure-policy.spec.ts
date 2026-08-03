/**
 * F804 — A 401 MUST VISIBLY TRANSITION STATE.
 *
 * Before this pass, the response interceptor handled 403+ENTITLEMENT_REQUIRED
 * and >=500 and nothing else, so an expired/revoked session fell through to the
 * generic failure modal and the app went on making unauthenticated requests
 * forever — signed out in fact, signed in on screen. These cases pin the whole
 * outcome set, and then drive the real store the interceptor drives.
 *
 * RED recipe: delete the `status === 401` case in api-failure-policy.ts and the
 * 401 cases below fail, including the store transition — which is exactly the
 * silent-anonymous state coming back.
 */
import { resolveApiFailureAction } from './api-failure-policy';
import { useSessionLapseStore } from '../store/sessionLapseStore';
import { useEntitlementLapseStore } from '../store/entitlementLapseStore';

describe('resolveApiFailureAction', () => {
  it('401 is a SESSION LAPSE, whatever else the body says', () => {
    expect(resolveApiFailureAction({ status: 401, errorCode: undefined })).toEqual({
      kind: 'session_lapse',
    });
    expect(resolveApiFailureAction({ status: 401, errorCode: 'ENTITLEMENT_REQUIRED' })).toEqual({
      kind: 'session_lapse',
    });
  });

  it('403 + ENTITLEMENT_REQUIRED stays the entitlement wall', () => {
    expect(resolveApiFailureAction({ status: 403, errorCode: 'ENTITLEMENT_REQUIRED' })).toEqual({
      kind: 'entitlement_lapse',
    });
  });

  it('a plain 403 belongs to the caller — it is not a session verdict', () => {
    expect(resolveApiFailureAction({ status: 403, errorCode: 'FORBIDDEN' })).toEqual({
      kind: 'caller_owned',
    });
  });

  it('5xx is a service issue; 4xx and "no response at all" are caller-owned', () => {
    expect(resolveApiFailureAction({ status: 500, errorCode: undefined }).kind).toBe(
      'service_issue'
    );
    expect(resolveApiFailureAction({ status: 503, errorCode: 'LLM_UNAVAILABLE' }).kind).toBe(
      'service_issue'
    );
    expect(resolveApiFailureAction({ status: 404, errorCode: undefined }).kind).toBe(
      'caller_owned'
    );
    expect(resolveApiFailureAction({ status: undefined, errorCode: undefined }).kind).toBe(
      'caller_owned'
    );
  });
});

describe('the 401 seam drives real, observable state', () => {
  beforeEach(() => {
    useSessionLapseStore.getState().clearLapse();
    useEntitlementLapseStore.getState().clearLapse();
  });

  /** The interceptor's dispatch, byte-for-byte in shape (see services/api.ts). */
  const dispatch = (status: number | undefined, errorCode?: string): void => {
    const action = resolveApiFailureAction({ status, errorCode });
    if (action.kind === 'session_lapse') {
      useSessionLapseStore.getState().announceLapse();
      return;
    }
    if (action.kind === 'entitlement_lapse') {
      useEntitlementLapseStore.getState().announceLapse();
    }
  };

  it('THE TRANSITION: a 401 flips the app into an explicit signed-out state', () => {
    expect(useSessionLapseStore.getState().lapsed).toBe(false);
    dispatch(401);
    expect(useSessionLapseStore.getState().lapsed).toBe(true);
  });

  it('a 401 does NOT raise the paywall, and an entitlement 403 does NOT sign you out', () => {
    dispatch(401);
    expect(useEntitlementLapseStore.getState().lapsed).toBe(false);

    useSessionLapseStore.getState().clearLapse();
    dispatch(403, 'ENTITLEMENT_REQUIRED');
    expect(useEntitlementLapseStore.getState().lapsed).toBe(true);
    expect(useSessionLapseStore.getState().lapsed).toBe(false);
  });

  it('an ordinary failure changes nothing — silence is only for the caller-owned case', () => {
    dispatch(404);
    dispatch(500);
    expect(useSessionLapseStore.getState().lapsed).toBe(false);
    expect(useEntitlementLapseStore.getState().lapsed).toBe(false);
  });

  it('the lapse clears (a fresh sign-in is representable, not a dead end)', () => {
    dispatch(401);
    useSessionLapseStore.getState().clearLapse();
    expect(useSessionLapseStore.getState().lapsed).toBe(false);
  });
});
