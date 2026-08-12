/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs a
   fresh require() per case: the policy caches its answer at first read. */
import { ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA } from './prompts/llm-response-schemas';

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
