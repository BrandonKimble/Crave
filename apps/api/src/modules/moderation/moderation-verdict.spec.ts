import { ModerationService } from './moderation.service';
import {
  moderationAllowed,
  moderationBlocked,
  moderationIndeterminate,
  resolveModeration,
} from './moderation-verdict';

/**
 * F105 / D9 — the moderation verdict is a sum type, and an unreachable
 * moderator no longer publishes.
 *
 * The RED case is the second spec: under the old boolean return, a thrown LLM
 * error produced `{allowed: true, reason: 'moderation_error'}` and every write
 * path in the app published the text. It cannot now.
 */

const createLogger = () =>
  ({
    setContext: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  }) as never;

describe('ModerationService returns a verdict, never a guess', () => {
  it('a clean answer is `allowed`', async () => {
    const llm = {
      moderateText: jest.fn().mockResolvedValue({ allowed: true }),
    };
    const service = new ModerationService(llm as never, createLogger());
    expect(await service.moderateText('hello')).toEqual({ kind: 'allowed' });
  });

  it('a refusal is `blocked`, carrying the moderator’s reason', async () => {
    const llm = {
      moderateText: jest
        .fn()
        .mockResolvedValue({ allowed: false, reason: 'hate' }),
    };
    const service = new ModerationService(llm as never, createLogger());
    expect(await service.moderateText('bad')).toEqual({
      kind: 'blocked',
      reason: 'hate',
    });
  });

  it('RED — a moderator outage is `indeterminate`, NOT an allow', async () => {
    const llm = {
      moderateText: jest.fn().mockRejectedValue(new Error('vendor 503')),
    };
    const service = new ModerationService(llm as never, createLogger());
    const verdict = await service.moderateText('anything');

    expect(verdict.kind).toBe('indeterminate');
    // The whole defect, stated as an assertion: there is no longer any way for
    // an outage to be reported as permission to publish.
    expect(verdict.kind).not.toBe('allowed');
  });
});

describe('resolveModeration puts the policy at the call site', () => {
  const outage = moderationIndeterminate('moderator_unavailable', 'vendor 503');

  it('a WRITE path (`hold`) REFUSES an outage, with a named cause', () => {
    const outcome = resolveModeration(outage, 'hold');
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.cause).toContain(
      'moderator_unavailable',
    );
  });

  it('a READ surface (`allow`) lets an outage through — availability wins', () => {
    expect(resolveModeration(outage, 'allow')).toEqual({ ok: true });
  });

  it('a BLOCK is a refusal under EITHER policy — policy governs only the unknown', () => {
    const blocked = moderationBlocked('hate');
    expect(resolveModeration(blocked, 'allow')).toEqual({
      ok: false,
      cause: 'hate',
    });
    expect(resolveModeration(blocked, 'hold')).toEqual({
      ok: false,
      cause: 'hate',
    });
  });

  it('an ALLOW is permitted under either policy', () => {
    expect(resolveModeration(moderationAllowed(), 'hold')).toEqual({
      ok: true,
    });
    expect(resolveModeration(moderationAllowed(), 'allow')).toEqual({
      ok: true,
    });
  });
});
