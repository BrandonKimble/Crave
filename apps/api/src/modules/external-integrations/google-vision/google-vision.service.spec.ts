import { of, throwError } from 'rxjs';
import {
  GoogleVisionService,
  ImageModerationUnavailableError,
} from './google-vision.service';

/**
 * SafeSearch moderation contract (D149-V). Three things are load-bearing and
 * each has a mutation named on it:
 *   1. the LIKELIHOOD -> verdict mapping (raise/lower the threshold, reds);
 *   2. every failure path THROWS rather than approving (the fail-open
 *      mutation — return an approved verdict from any catch and it reds);
 *   3. every call writes a `google_vision` ledger line (delete the meter and
 *      it reds) — the whole point of the migration was that moderation stop
 *      being spend nobody could see.
 */
function build(overrides?: {
  apiKey?: string | undefined;
  spendVerdict?: 'open' | 'exhausted' | 'unarmed';
}) {
  const post = jest.fn();
  const record = jest.fn();
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  logger.setContext.mockReturnValue(logger);
  const config = {
    get: (key: string) =>
      key === 'googleVision.apiKey'
        ? overrides && 'apiKey' in overrides
          ? overrides.apiKey
          : 'test-key'
        : key === 'googleVision.timeout'
          ? 15000
          : undefined,
  };
  // The spend gate's verdict is part of the constructor now. Default 'open'
  // so the existing moderation assertions measure moderation; the gate's own
  // behaviour (never refusing a user, reporting an unarmed vendor) is
  // asserted separately below.
  const visionSpendVerdict = jest
    .fn<Promise<'open' | 'exhausted' | 'unarmed'>, []>()
    .mockResolvedValue(overrides?.spendVerdict ?? 'open');
  const service = new GoogleVisionService(
    { post } as never,
    config as never,
    { record } as never,
    { visionSpendVerdict } as never,
    logger as never,
  );
  return { service, post, record, logger, visionSpendVerdict };
}

const annotation = (a: Record<string, string>) =>
  of({ data: { responses: [{ safeSearchAnnotation: a }] } });

describe('GoogleVisionService.moderateImage', () => {
  it('LIKELY adult -> REJECTED, with the deciding category in the reason', async () => {
    // MUTATION: move REJECT_AT_OR_ABOVE to 'VERY_LIKELY' and this reds.
    const { service, post } = build();
    post.mockReturnValue(
      annotation({
        adult: 'LIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'UNLIKELY',
      }),
    );
    const verdict = await service.moderateImage('https://img/1');
    expect(verdict.decision).toBe('rejected');
    expect(verdict.reason).toBe('adult:LIKELY');
  });

  it('VERY_LIKELY racy and VERY_LIKELY violence both reject', async () => {
    const { service, post } = build();
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_LIKELY',
      }),
    );
    expect((await service.moderateImage('https://img/1')).decision).toBe(
      'rejected',
    );
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_LIKELY',
        racy: 'VERY_UNLIKELY',
      }),
    );
    expect((await service.moderateImage('https://img/1')).decision).toBe(
      'rejected',
    );
  });

  it('POSSIBLE is BELOW the bar, and spoof/medical never decide anything', async () => {
    // MUTATION: lower REJECT_AT_OR_ABOVE to 'POSSIBLE', or add 'spoof' /
    // 'medical' to DECIDING_CATEGORIES, and this reds. Both would destroy
    // ordinary food photos — latte art reads as spoof, a red-sauce dish as
    // POSSIBLE violence.
    const { service, post } = build();
    post.mockReturnValue(
      annotation({
        adult: 'POSSIBLE',
        racy: 'POSSIBLE',
        violence: 'POSSIBLE',
        spoof: 'VERY_LIKELY',
        medical: 'VERY_LIKELY',
      }),
    );
    expect((await service.moderateImage('https://img/1')).decision).toBe(
      'approved',
    );
  });

  it('METERS every call into the ledger as google_vision, BEFORE the request', async () => {
    // MUTATION: delete the usageLedger.record call and this reds. Moving it
    // after the await reds the failure case below.
    const { service, post, record } = build();
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_UNLIKELY',
      }),
    );
    await service.moderateImage('https://img/1');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'google_vision',
        operation: 'safeSearchDetection',
      }),
    );
  });

  it('a FAILED call is still metered — a timeout was still billed', async () => {
    const { service, post, record } = build();
    post.mockReturnValue(throwError(() => new Error('timeout')));
    await expect(service.moderateImage('https://img/1')).rejects.toThrow(
      ImageModerationUnavailableError,
    );
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('NO FAILURE PATH RETURNS APPROVED — transport, 4xx, and empty envelopes all throw', async () => {
    // THE fail-open mutation: return `{ decision: 'approved' }` from any of
    // these paths and this reds. Callers turn a throw into "stay pending".
    const { service, post } = build();

    // no response at all -> transient
    post.mockReturnValue(throwError(() => new Error('ECONNRESET')));
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: true,
    });

    // 5xx / 429 -> transient
    post.mockReturnValue(
      throwError(() => ({ response: { status: 503 }, message: 'boom' })),
    );
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: true,
    });

    // 403 (bad key / API disabled) -> PERMANENT, and still never approved
    post.mockReturnValue(
      throwError(() => ({ response: { status: 403 }, message: 'denied' })),
    );
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: false,
    });

    // a 200 carrying a per-image error
    post.mockReturnValue(
      of({ data: { responses: [{ error: { message: 'cannot fetch' } }] } }),
    );
    await expect(service.moderateImage('u')).rejects.toThrow(
      ImageModerationUnavailableError,
    );

    // a 200 carrying nothing at all
    post.mockReturnValue(of({ data: {} }));
    await expect(service.moderateImage('u')).rejects.toThrow(
      ImageModerationUnavailableError,
    );
  });

  it('MUTATION (F9702): an EMPTY or UNKNOWN annotation is NOT an approval', async () => {
    // THE DEFECT, EXACTLY. Both of these used to return `approved`: a missing
    // category and `UNKNOWN` alike ranked 0 — the safest possible score — so
    // an annotation of `{}` (present, empty: a partially-failed or
    // future-shaped response) sailed past all three categories and published
    // an image no moderator had actually looked at.
    //
    // MUTATION TO RE-RED IT: delete the `undecided` guard, or rank a missing
    // category at 0 again, and both assertions below flip to 'approved'.
    const { service, post } = build();

    post.mockReturnValue(annotation({}));
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: true,
      scope: 'image',
    });

    post.mockReturnValue(
      annotation({ adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN' }),
    );
    await expect(service.moderateImage('u')).rejects.toThrow(
      ImageModerationUnavailableError,
    );

    // A PARTIAL answer is also no answer — two scored, one silent.
    post.mockReturnValue(
      annotation({ adult: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' }),
    );
    await expect(service.moderateImage('u')).rejects.toThrow(/violence/);

    // …and a complete answer still approves, so the guard is not just
    // rejecting everything.
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'UNLIKELY',
        racy: 'POSSIBLE',
      }),
    );
    expect((await service.moderateImage('u')).decision).toBe('approved');
  });

  it('a per-image 200 error is scoped to the IMAGE — the only terminal answer', async () => {
    // The distinction F9703 spends money on: `service` failures (key, quota,
    // network) are OUR outage and must retry forever; an image Google cannot
    // read will answer the same way every ten minutes until someone notices
    // the bill. Only this one may terminate a photo.
    const { service, post } = build();
    post.mockReturnValue(
      of({ data: { responses: [{ error: { message: 'cannot fetch' } }] } }),
    );
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: false,
      scope: 'image',
    });

    // A 403 is OURS — never terminal, however permanent it looks.
    post.mockReturnValue(
      throwError(() => ({ response: { status: 403 }, message: 'denied' })),
    );
    await expect(service.moderateImage('u')).rejects.toMatchObject({
      transient: false,
      scope: 'service',
    });
  });

  it('an unconfigured key fails LOUD at first use — and does not approve', async () => {
    // MUTATION: default the key to '' and let the request go out, or return
    // approved when unconfigured, and this reds. An environment without the
    // key parks photos in pending; it never publishes unmoderated ones.
    const { service, post } = build({ apiKey: undefined });
    await expect(service.moderateImage('u')).rejects.toThrow(
      /GOOGLE_VISION_API_KEY/,
    );
    expect(post).not.toHaveBeenCalled();
  });
});

/**
 * THE SPEND GATE, at the vendor's one door (D4, 2026-08-13).
 *
 * Vision was the fourth metered vendor and the only ungated one. These
 * assert the two properties that make the gate honest rather than merely
 * present: it is consulted on EVERY call, and it never turns a user's photo
 * into a failure.
 */
describe('GoogleVisionService spend gate', () => {
  it('consults the gate before every annotate call', async () => {
    const { service, post, visionSpendVerdict } = build();
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_UNLIKELY',
      }),
    );
    await service.moderateImage('u');
    expect(visionSpendVerdict).toHaveBeenCalledTimes(1);
  });

  it('an EXHAUSTED budget still moderates the photo — D149, and screams', async () => {
    const { service, post, logger } = build({ spendVerdict: 'exhausted' });
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_UNLIKELY',
      }),
    );
    // The user's upload is NOT refused by our own counter...
    await expect(service.moderateImage('u')).resolves.toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
    // ...but the runaway is loud.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('CLOSED'),
      expect.objectContaining({ verdict: 'exhausted' }),
    );
  });

  it('an UNARMED gate is reported, not passed over in silence', async () => {
    const { service, post, logger } = build({ spendVerdict: 'unarmed' });
    post.mockReturnValue(
      annotation({
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_UNLIKELY',
      }),
    );
    await service.moderateImage('u');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('UNGOVERNED'),
      expect.objectContaining({ verdict: 'unarmed' }),
    );
  });
});
