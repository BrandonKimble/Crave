import 'reflect-metadata';
import { PollsService } from './polls.service';

/**
 * A GEMINI OUTAGE MUST NOT COST SOMEONE THEIR POLL (F9600, D149).
 *
 * `createPollFromQuestion` awaited `inferPollSubject` uncaught. Subject
 * inference decides ranked-vs-discussion and ALREADY answers 'discussion'
 * whenever it cannot tell — but a vendor error arrived as a throw, so an AI
 * Studio cap (which poisons our pool until the calendar month rolls) turned
 * "create a poll" into a 500 for weeks.
 *
 * The honest degrade is the one the classifier already uses for "I cannot
 * tell": publish the question as a discussion thread.
 */
describe('PollsService.createPollFromQuestion — LLM failure degrades, never 500s', () => {
  type Proto = {
    createPollFromQuestion: (
      this: unknown,
      rawQuestion: string,
      dto: unknown,
      userId: string,
      place: unknown,
    ) => Promise<unknown>;
  };

  const proto = PollsService.prototype as unknown as Proto;

  const host = (inferPollSubject: () => Promise<unknown>) => {
    const createDiscussionPoll = jest.fn().mockResolvedValue('discussion-poll');
    const createStructuredPoll = jest.fn().mockResolvedValue('structured-poll');
    return {
      host: {
        sanitizer: { sanitizeOrThrow: (value: string) => value },
        moderation: { moderateText: () => ({ kind: 'allowed' as const }) },
        llmService: { inferPollSubject },
        logger: { warn: jest.fn(), error: jest.fn() },
        createDiscussionPoll,
        createStructuredPoll,
        mapAxisToStructured:
          PollsService.prototype['mapAxisToStructured' as keyof PollsService],
      },
      createDiscussionPoll,
      createStructuredPoll,
    };
  };

  it('a THROWN inference (vendor cap, transport, poisoned pool) still creates the poll', async () => {
    // MUTATION: remove the try/catch around inferPollSubject and this rejects
    // — which is the live 500 on a person's poll.
    const { host: self, createDiscussionPoll } = host(() =>
      Promise.reject(new Error('AI Studio monthly cap')),
    );
    await expect(
      proto.createPollFromQuestion.call(self, 'best tacos?', {}, 'u1', {}),
    ).resolves.toBe('discussion-poll');
    expect(createDiscussionPoll).toHaveBeenCalledTimes(1);
  });

  it('a WORKING inference still routes a ranked question to the structured flow', async () => {
    // MUTATION: make the catch arm unconditional (always discussion) and this
    // reds — the degrade must be a fallback, not the new behavior.
    const { host: self, createStructuredPoll } = host(() =>
      Promise.resolve({
        mode: 'ranked',
        confidence: 1,
        reason: 'ranked',
        axis: {
          targetType: 'dish',
          constraint: { kind: 'category', value: 'tacos' },
          anchor: null,
        },
      }),
    );
    await expect(
      proto.createPollFromQuestion.call(self, 'best tacos?', {}, 'u1', {}),
    ).resolves.toBe('structured-poll');
    expect(createStructuredPoll).toHaveBeenCalledTimes(1);
  });
});
