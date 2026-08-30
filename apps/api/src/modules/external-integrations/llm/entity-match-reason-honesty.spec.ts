/**
 * THE SINGLE ENTITY-MATCH LANE MUST NOT LAUNDER THE DECISION TOKEN AS A
 * REASON (red-team G1, 2026-08-30).
 *
 * The wave's own audit: a reason equal to the decision token is not evidence
 * (58% of audited rows). The batch lane leaves reason undefined on silence
 * and the placement lane writes '(unstated)' — but the single transport's
 * parser said `reason = stated || decision`, fabricating reason='match' /
 * 'new' on a silent verdict and defeating every consumer that treats a
 * non-empty reason as a stated ground (the hearing ledger's
 * reasonless-verdict refusal).
 *
 * Mutation-proof: restore `stated || decision` in parseEntityMatchResponse
 * and the silent-match case below returns reason 'match' — RED.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { LLMService } from './llm.service';
import type { LLMEntityMatchResult } from './llm.types';

const CANONICAL = readFileSync(
  join(__dirname, 'prompts', 'entity-match-prompt.md'),
  'utf-8',
);

const stubLogger = {
  setContext: () => stubLogger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

const buildService = (responseJson: string) => {
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
  internals.entityMatchPrompt = CANONICAL;
  internals.getThinkingConfig = () => null;
  internals.callLLMApi = () => Promise.resolve(responseJson);
  internals.extractTextContent = (response: string) => response;
  return service;
};

const match = (service: LLMService): Promise<LLMEntityMatchResult> =>
  service.matchEntity({
    term: 'al pastor taco',
    kind: 'item',
    candidates: [{ id: 1, name: 'taco' }],
  } as never);

describe('matchEntity — reasons are evidence, never the decision token (G1)', () => {
  it('a silent match keeps reason ABSENT — never synthesized from the decision word', async () => {
    const result = await match(
      buildService('{"decision":"match","candidate_id":1}'),
    );
    expect(result.decision).toBe('match');
    expect(result.candidateId).toBe(1);
    expect(result.reason).toBeUndefined();
  });

  it('a silent new keeps reason ABSENT', async () => {
    const result = await match(
      buildService('{"decision":"new","candidate_id":null}'),
    );
    expect(result.decision).toBe('new');
    expect(result.reason).toBeUndefined();
  });

  it('a stated reason passes through verbatim', async () => {
    const result = await match(
      buildService(
        '{"decision":"match","candidate_id":1,"reason":"same dish, alias evidence"}',
      ),
    );
    expect(result.reason).toBe('same dish, alias evidence');
  });

  it('a reasonless reject still degrades to new (the tombstone is permanent; silence is recoverable) with reason absent', async () => {
    const result = await match(
      buildService('{"decision":"reject","candidate_id":null}'),
    );
    expect(result.decision).toBe('new');
    expect(result.reason).toBeUndefined();
  });
});
