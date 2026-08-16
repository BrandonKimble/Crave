/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs a
   fresh require() per case: the policy caches its answer at first read. */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_RESPONSE_JSON_SCHEMA,
  POLL_SUBJECT_RESPONSE_JSON_SCHEMA,
  PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
} from './prompts/llm-response-schemas';

type SchemaNode = {
  properties: Record<string, SchemaNode | Record<string, unknown>>;
  required?: string[];
  items?: SchemaNode;
};
const itemNode = (schema: unknown): SchemaNode => {
  const root = schema as SchemaNode;
  return (root.properties.items as SchemaNode).items as SchemaNode;
};

/**
 * AUDIT-REASON POLICY (rederivation 2026-08-11): reasons are ALWAYS ON by
 * default, in every environment — LLM_AUDIT_REASONS=false is the loud,
 * deliberate off-switch. Mutation proofs:
 * - reverting to the old dev-on/prod-off default fails the "prod defaults
 *   on" test;
 * - breaking the recursive strip fails the nested-schema test (a stripped
 *   schema that still REQUIRES reason makes the model's output invalid).
 *
 * Module state (the policy caches its answer) is isolated per test via
 * jest.isolateModules.
 */

type PolicyModule = {
  auditReasonsEnabled: () => boolean;
  applyAuditReasonPolicy: <T extends Record<string, unknown>>(
    schema: T,
  ) => Record<string, unknown>;
};

/** Run `fn` with the given env in force and a FRESH policy module (its
 *  answer is cached per module instance), restoring env afterwards. */
function withPolicy<T>(
  env: Record<string, string | undefined>,
  fn: (policy: PolicyModule) => T,
): T {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    let result!: T;
    jest.isolateModules(() => {
      result = fn(require('./llm-audit-policy') as PolicyModule);
    });
    return result;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('auditReasonsEnabled', () => {
  it('defaults ON — including in production', () => {
    withPolicy(
      {
        LLM_AUDIT_REASONS: undefined,
        APP_ENV: 'production',
        NODE_ENV: 'production',
      },
      (policy) => expect(policy.auditReasonsEnabled()).toBe(true),
    );
  });

  it('LLM_AUDIT_REASONS=false is the explicit off-switch', () => {
    withPolicy({ LLM_AUDIT_REASONS: 'false' }, (policy) =>
      expect(policy.auditReasonsEnabled()).toBe(false),
    );
  });
});

/**
 * THE POLICY'S OWN ROSTER (red team 2026-08-12). llm-audit-policy names the
 * covered judge lanes in prose: entity match single+batch, attribute
 * placement, poll subject, place chooser. The place chooser had NO reason
 * field and no policy call — the ruling was documented on a lane that never
 * implemented it, which is exactly the drift a prose roster invites. This
 * turns the roster into an executable one: every named lane's schema must ask
 * for a reason, and every named lane's call site must route through the
 * policy, or the off-switch is a lie there.
 */
describe('the judge lanes the policy claims to cover', () => {
  const lanes: Array<[string, Record<string, unknown>]> = [
    ['entity match (single)', ENTITY_MATCH_RESPONSE_JSON_SCHEMA],
    ['attribute placement', ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA],
    ['poll subject', POLL_SUBJECT_RESPONSE_JSON_SCHEMA],
    ['place chooser', PLACE_CHOOSER_RESPONSE_JSON_SCHEMA],
  ];

  it.each(lanes)('%s asks for a reason, and REQUIRES it', (_name, schema) => {
    const node = schema as unknown as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(node.properties.reason).toBeDefined();
    expect(node.required).toContain('reason');
  });

  it('entity match (batch) asks for a per-item reason', () => {
    const item = itemNode(ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA);
    expect(item.properties.reason).toBeDefined();
    expect(item.required).toContain('reason');
  });

  it('every covered schema reaches the model THROUGH the policy', () => {
    const service = readFileSync(join(__dirname, 'llm.service.ts'), 'utf-8');
    for (const constant of [
      'ENTITY_MATCH_RESPONSE_JSON_SCHEMA',
      'ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA',
      'ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA',
      'POLL_SUBJECT_RESPONSE_JSON_SCHEMA',
      'PLACE_CHOOSER_RESPONSE_JSON_SCHEMA',
    ]) {
      expect(service).toMatch(
        new RegExp(`applyAuditReasonPolicy\\(\\s*${constant}`),
      );
    }
  });
});

describe('applyAuditReasonPolicy', () => {
  it('returns the schema unchanged when reasons are on (reason stays REQUIRED)', () => {
    const out = withPolicy({ LLM_AUDIT_REASONS: 'true' }, (policy) =>
      policy.applyAuditReasonPolicy(ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA),
    );
    const item = itemNode(out);
    expect(item.properties.reason).toBeDefined();
    expect(item.required).toContain('reason');
  });

  it('strips reason at every nesting depth when off — properties AND required', () => {
    const out = withPolicy({ LLM_AUDIT_REASONS: 'false' }, (policy) =>
      policy.applyAuditReasonPolicy(ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA),
    );
    const item = itemNode(out);
    expect(item.properties.reason).toBeUndefined();
    expect(item.required).not.toContain('reason');
    // And the original is untouched (deep clone, not in-place surgery).
    expect(
      itemNode(ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA).required,
    ).toContain('reason');
  });
});
