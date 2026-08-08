import { OptionalClerkAuthGuard } from './optional-clerk-auth.guard';

/**
 * A DELETED ACCOUNT IS A NON-IDENTITY ON THE OPTIONAL PATH TOO (F9964).
 *
 * THE GAP THIS PROVES CLOSED. Three places in this codebase stated, in as many
 * words, that "every authenticated route refuses a user whose deletedAt is
 * set" — one of them written by me to JUSTIFY making session revocation
 * best-effort. It was true of ClerkAuthGuard and false of this one, which has
 * no lifecycle check at all: it attached the deleted user as `request.user` on
 * six anonymous-public GETs, so a closed account stayed a personalized VIEWER
 * (block filtering, "did I vote") for the length of its grace window.
 *
 * REFUSING WAS NOT THE ANSWER, which is why this guard is not simply a copy of
 * the required one. Its routes are public; a 403 would break them for
 * everybody. The right answer is the third option — the deleted account is
 * neither an error nor a viewer, it is ANONYMOUS.
 *
 * WHY BYTE-IDENTICAL IS THE PROPERTY, and not merely "user is undefined": the
 * observable difference between a viewer and a visitor is not one field, it is
 * everything downstream that reads it. So the assertion is that the guard's
 * whole effect — what it attaches AND what it records — is indistinguishable
 * from the no-token case.
 */
describe('optional auth — a deleted account is anonymous, not a viewer', () => {
  const claims = { sub: 'clerk-1' } as never;

  const makeGuard = (user: { userId: string; deletedAt: Date | null }) => {
    const recordObservation = jest.fn();
    const guard = new OptionalClerkAuthGuard(
      {
        extractBearerToken: (h?: string) => (h ? 'token' : undefined),
        verifyToken: jest.fn().mockResolvedValue(claims),
      } as never,
      { syncFromClerkClaims: jest.fn().mockResolvedValue(user) } as never,
      { recordObservation } as never,
    );
    return { guard, recordObservation };
  };

  const runWith = async (
    user: { userId: string; deletedAt: Date | null } | null,
  ) => {
    const request: Record<string, unknown> = {
      headers: user ? { authorization: 'Bearer t', 'x-device-key': 'd1' } : {},
    };
    const { guard, recordObservation } = makeGuard(
      user ?? { userId: 'unused', deletedAt: null },
    );
    const allowed = await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);
    return {
      allowed,
      user: request.user,
      deviceObservations: recordObservation.mock.calls.length,
    };
  };

  it('a deleted account is INDISTINGUISHABLE from a signed-out visitor', async () => {
    const anonymous = await runWith(null);
    const deleted = await runWith({ userId: 'u-1', deletedAt: new Date() });
    // The whole effect, compared as one object — not field by field, because
    // "which fields matter" is exactly the judgement that let this gap exist.
    expect(deleted).toEqual(anonymous);
    // And spelled out, so a future reader sees the two things that must hold:
    expect(deleted.allowed).toBe(true); // the public route still serves
    expect(deleted.user).toBeUndefined(); // but to nobody in particular
  });

  it('a LIVE account is still a viewer — the guard did not just stop working', async () => {
    // The failure mode of a lifecycle check is over-application: drop everyone
    // and every assertion above passes while personalization is dead for all.
    const live = await runWith({ userId: 'u-2', deletedAt: null });
    expect(live.user).toEqual({ userId: 'u-2', deletedAt: null });
    expect(live.deviceObservations).toBe(1);
  });

  it('records NO device observation for a deleted account', async () => {
    // The vote-integrity ledger must not keep being fed an identity that is on
    // its way to being erased — and this is why the guard returns BEFORE the
    // observation rather than merely skipping the assignment.
    const deleted = await runWith({ userId: 'u-3', deletedAt: new Date() });
    expect(deleted.deviceObservations).toBe(0);
  });
});
