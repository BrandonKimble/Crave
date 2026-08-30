/**
 * THE SAMENESS COURT'S D2 CONTEXT + REJECT CONTRACT (2026-08-30).
 *
 * Pins the three new mechanical behaviors the rederivation added:
 *   1. context wire shapes (caps, omission-when-empty, trim) — one
 *      implementation for both transports;
 *   2. the reject verdict is honoured ONLY with a stated ground (a
 *      reasonless reject degrades to the recoverable 'new' — the tombstone
 *      sink is permanent and must never be minted on silence);
 *   3. mentionSentenceOf never invents provenance and caps the excerpt.
 */
import {
  entityMatchCandidateWire,
  entityMatchContextWire,
  ENTITY_MATCH_ALIAS_CAP,
  ENTITY_MATCH_HOME_PLACE_CAP,
} from './entity-match-prompt';
import { LLMService } from './llm.service';
import { mentionSentenceOf } from '../../content-processing/reddit-collector/mention-sentence';

describe('entityMatchContextWire', () => {
  it('omits everything on an empty input (legacy callers unchanged)', () => {
    expect(entityMatchContextWire({})).toEqual({});
    expect(
      entityMatchContextWire({ mention: '  ', threadPlace: null }),
    ).toEqual({});
  });

  it('trims and caps', () => {
    const wire = entityMatchContextWire({
      mention: '  the soto omakase was great  ',
      threadPlace: ' Soto ',
      termHomePlaces: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(wire.mention).toBe('the soto omakase was great');
    expect(wire.thread_place).toBe('Soto');
    expect(wire.term_home_places).toHaveLength(ENTITY_MATCH_HOME_PLACE_CAP);
  });
});

describe('entityMatchCandidateWire home evidence', () => {
  it('caps home_places and carries same_place only when known', () => {
    const wire = entityMatchCandidateWire({
      id: 1,
      name: 'omakase',
      aliases: Array.from({ length: 10 }, (_, i) => `alias${i}`),
      homePlaces: ['Soto', 'OTOKO', 'Uchi', 'Tare'],
      samePlace: true,
    });
    expect(wire.aliases).toHaveLength(ENTITY_MATCH_ALIAS_CAP);
    expect(wire.home_places).toEqual(['Soto', 'OTOKO', 'Uchi']);
    expect(wire.same_place).toBe(true);
    const bare = entityMatchCandidateWire({ id: 2, name: 'taco' });
    expect(bare).toEqual({ id: 2, name: 'taco' });
  });
});

describe('matchEntitiesBatch reject handling', () => {
  const stubLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    setContext: () => stubLogger,
  };

  const drive = async (response: string) => {
    const service = new LLMService(
      { get: () => undefined } as never,
      { setContext: () => stubLogger } as never,
      {} as never,
      {} as never,
      { record: () => undefined } as never,
      {} as never,
      { emit: () => undefined } as never,
      {} as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.logger = stubLogger;
    internals.llmConfig = { topP: 0.95, topK: 40 };
    internals.entityMatchPrompt = '# stub';
    internals.getThinkingConfig = () => null;
    internals.callLLMApi = () => Promise.resolve(response);
    internals.extractTextContent = (r: string) => r;
    return service.matchEntitiesBatch({
      kind: 'item',
      items: [{ term: '5 piece', candidates: [{ id: 0, name: 'omakase' }] }],
    });
  };

  it('honours reject WITH a stated ground', async () => {
    const [verdict] = await drive(
      '{"items":[{"index":0,"decision":"reject","candidateId":null,"reason":"bare quantity, no food noun"}]}',
    );
    expect(verdict.decision).toBe('reject');
    expect(verdict.reason).toBe('bare quantity, no food noun');
  });

  it('degrades a reasonless reject to new (never a silent tombstone)', async () => {
    const [verdict] = await drive(
      '{"items":[{"index":0,"decision":"reject","candidateId":null,"reason":""}]}',
    );
    expect(verdict.decision).toBe('new');
  });
});

describe('mentionSentenceOf', () => {
  const text =
    'Seems like a good deal. We got the Soto Omakase for my birthday and it was quite good, but the price was steep. Would return anyway.';

  it('returns the containing sentence, case-insensitively', () => {
    expect(mentionSentenceOf(text, 'soto omakase')).toBe(
      'We got the Soto Omakase for my birthday and it was quite good, but the price was steep.',
    );
  });

  it('never invents provenance: absent surface -> null', () => {
    expect(mentionSentenceOf(text, 'shanghai lumpia')).toBeNull();
    expect(mentionSentenceOf(undefined, 'soto omakase')).toBeNull();
    expect(mentionSentenceOf(text, '  ')).toBeNull();
  });

  it('caps a runaway sentence at 320 chars', () => {
    const long = `the omakase ${'x'.repeat(600)}`;
    const sentence = mentionSentenceOf(long, 'omakase');
    expect(sentence).not.toBeNull();
    expect(sentence!.length).toBeLessThanOrEqual(321);
    expect(sentence!.endsWith('…')).toBe(true);
  });
});
