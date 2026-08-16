/**
 * DOES THE PROMPT DESCRIBE THE REQUEST WE ACTUALLY SEND?
 *
 * THE FINDING THIS INSTRUMENT EXISTS FOR (prompt-fleet audit, 2026-08-12).
 * The canonical entity-match .md drifted into describing the BATCH request —
 * "you receive `items`", "one verdict per `index`", output key `candidateId`
 * — while the SINGLE transport sends `{term, kind, candidates:[{id, name}]}`
 * and enforces a schema whose id field is snake_case `candidate_id`. Both
 * halves were internally consistent and every existing spec was green: the
 * binding spec compared the .md to the OTHER rendered text, never to the bytes
 * on the wire. A model told to key its answer by `index` on a request that has
 * no index is a silent-accuracy defect, not a crash.
 *
 * So this spec closes the loop the other one cannot see: it renders each
 * mode's REAL system instruction, captures the REAL JSON payload the service
 * puts on the wire (by driving matchEntity / matchEntitiesBatch with the
 * transport stubbed at callLLMApi), and cross-checks FIELD NAMES in both
 * directions, case-sensitively:
 *
 *   → every field the instruction names must exist in that mode's payload or
 *     its enforced response schema (no `index` in a single request);
 *   ← every field of that payload and schema must be named in the instruction
 *     (nothing arrives unannounced).
 *
 * Case sensitivity is the point, not pedantry: `candidateId` vs
 * `candidate_id` is exactly the drift that shipped.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { LLMService } from './llm.service';
import { renderEntityMatchSystemInstruction } from './entity-match-prompt';
import {
  ENTITY_MATCH_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA,
} from './prompts/llm-response-schemas';

const CANONICAL = readFileSync(
  join(__dirname, 'prompts', 'entity-match-prompt.md'),
  'utf-8',
);

/**
 * Tokens the prompt writes in backticks or quotes that name something. Most are
 * ordinary prose ("pizza", "marinara", `restaurant`), and a scanner that
 * demanded those exist on the wire would be noise. The signal is narrower and
 * exact: a token that IS a field name SOMEWHERE in this pair of transports but
 * NOT in the one being rendered. That is what drift looks like — the single
 * lane's prompt saying `index`, `items`, `candidateId`, all real field names,
 * none of them in a single request. No prose allowlist to maintain: the
 * vocabulary is derived from the wire itself.
 */
const namedTokens = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const [, token] of text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    found.add(token);
  }
  // The envelopes also state the shape inline, e.g. `{"term", "kind"}`.
  for (const [, token] of text.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)) {
    found.add(token);
  }
  return found;
};

/** Every key appearing anywhere in a JSON value, at any depth. */
const keysDeep = (value: unknown, into = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, into);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      keysDeep(child, into);
    }
  }
  return into;
};

/** Property names declared by a JSON schema, at any depth. */
const schemaFields = (node: unknown, into = new Set<string>()): Set<string> => {
  if (!node || typeof node !== 'object') return into;
  const record = node as Record<string, unknown>;
  const properties = record.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, child] of Object.entries(properties)) {
      into.add(key);
      schemaFields(child, into);
    }
  }
  schemaFields(record.items, into);
  return into;
};

/**
 * Build the service far enough to render a request and stop it at the wire.
 * Nothing is mocked ABOVE the transport, so the payload captured here is the
 * one production sends — a hand-written fixture of the payload would be a
 * second source of truth, which is the disease being tested for.
 */
interface Wire {
  payload: unknown;
  systemInstruction: string;
}

const captureWire = async (mode: 'single' | 'batch'): Promise<Wire> => {
  const captured: Wire[] = [];
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
  internals.callLLMApi = (
    payload: string,
    options: { systemInstruction: string },
  ) => {
    captured.push({
      payload: JSON.parse(payload),
      systemInstruction: options.systemInstruction,
    });
    // A well-formed empty verdict: the parse path is exercised, and this spec
    // asserts on the REQUEST, so the response only has to be valid.
    return Promise.resolve(
      mode === 'single'
        ? '{"decision":"new","candidate_id":null}'
        : '{"items":[{"index":0,"decision":"new","candidateId":null}]}',
    );
  };
  internals.extractTextContent = (response: string) => response;

  if (mode === 'single') {
    await service.matchEntity({
      // THE FIXTURE MUST EXERCISE EVERY FIELD ITS TRANSPORT CAN SEND, and
      // `aliases` is one of them since 559f11922 gave the single path the same
      // candidate wire as the batch path (entityMatchCandidateWire). Without an
      // alias here the captured single payload had no `aliases` key while the
      // batch payload did, so `aliases` sat in the field universe but not in
      // single's field set — and the single envelope, which correctly explains
      // aliases, was reported as naming a FOREIGN field. That is a defect in
      // the fixture, not in the prompt: an under-fed fixture makes this spec
      // accuse the very parity it should be confirming.
      term: 'al pastor taco',
      kind: 'item',
      candidates: [{ id: 1, name: 'taco', aliases: ['tacos'] }],
    } as never);
  } else {
    await service.matchEntitiesBatch({
      kind: 'item',
      items: [
        {
          term: 'al pastor taco',
          candidates: [{ id: 1, name: 'taco', aliases: ['tacos'] }],
        },
      ],
    } as never);
  }
  expect(captured).toHaveLength(1);
  return captured[0];
};

const stubLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  setContext: () => stubLogger,
};

describe('entity-match prompt ↔ wire conformance', () => {
  const modes = [
    { mode: 'single' as const, schema: ENTITY_MATCH_RESPONSE_JSON_SCHEMA },
    { mode: 'batch' as const, schema: ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA },
  ];

  const wireFields = async (
    mode: 'single' | 'batch',
    schema: unknown,
  ): Promise<{ wire: Wire; fields: Set<string> }> => {
    const wire = await captureWire(mode);
    return {
      wire,
      fields: new Set([...keysDeep(wire.payload), ...schemaFields(schema)]),
    };
  };

  /** Every field name either transport uses — the vocabulary drift steals from. */
  const fieldUniverse = async (): Promise<Set<string>> => {
    const all = new Set<string>();
    for (const { mode, schema } of modes) {
      for (const field of (await wireFields(mode, schema)).fields)
        all.add(field);
    }
    return all;
  };

  it.each(modes)(
    '$mode: the rendered instruction is the one this transport actually sends',
    async ({ mode }) => {
      const wire = await captureWire(mode);
      expect(wire.systemInstruction).toBe(
        renderEntityMatchSystemInstruction(CANONICAL, mode),
      );
    },
  );

  it.each(modes)(
    '$mode: the prompt names NO field that belongs to the other transport',
    async ({ mode, schema }) => {
      const { wire, fields } = await wireFields(mode, schema);
      const universe = await fieldUniverse();
      const foreign = [...namedTokens(wire.systemInstruction)].filter(
        (token) => universe.has(token) && !fields.has(token),
      );
      // THE SHIPPED DEFECT, as an assertion: the single lane's instruction
      // named `items`, `index` and `candidateId` — real fields, all of them
      // belonging to the BATCH request. The model was told to key its answer
      // by something that was never sent.
      expect(foreign).toEqual([]);
    },
  );

  /**
   * KNOWN GAP — OWNED BY THE PROMPT SESSION, NOT THIS ONE.
   *
   * The reverse direction is not clean today: every candidate on the wire
   * carries a `name`, and the canonical .md never names that field ("existing
   * entities ... each with an `id`"). The whole judgment is about names, so
   * the model infers it correctly and nothing is visibly broken — which is
   * precisely why it survived. Fixing it means editing the .md, which this
   * session does not own, so the residue is PINNED rather than tolerated:
   * this assertion fails the moment either side changes, including the moment
   * someone fixes it.
   */
  it.each(modes)(
    '$mode: fields on the wire the prompt never names — pinned residue, expected RED once the .md is fixed',
    async ({ mode, schema }) => {
      const { wire, fields } = await wireFields(mode, schema);
      const named = namedTokens(wire.systemInstruction);
      const unannounced = [...fields].filter((field) => !named.has(field));
      expect(unannounced).toEqual(['name']);
    },
  );
});
