/**
 * THE JUDGE CONTRACT — one declared contract per LLM decision site
 * (plans/llm-lane-primitive.md, 2026-08-31).
 *
 * The 2026-08-31 audit found one pattern implemented ~15 times with ad-hoc
 * coverage: four different re-open mechanisms, ~7 prompts loading unversioned
 * bytes, effects applied with no ledger row. Each past incident in this class
 * is a missing cell in that coverage table — the fold v2 bump forgot the
 * LEDGER read filter and 152k verdicts went invisible; the 47 wrong merges
 * were "the judge announced every bad merge in its reason and nothing read
 * it"; the 716-decline grounding sweep was context starvation nobody had
 * declared. The failure mode to prevent is not difference between lanes — it
 * is UNDECLARED difference.
 *
 * This file generalizes the two proven enforcement shapes already in-repo:
 * DerivedIndexJob (a derived table cannot exist without a job — the spec
 * fails on existence) and BaseClaimLaneAdapter (a lane cannot exist without
 * declaring its claim key and fold participation). Here: an LLM decision
 * site cannot exist without a contract, and every deviation from the ideal
 * shape is an explicit object carrying its reason.
 *
 * THIS PASS DECLARES AND AUDITS — it changes no live decision path. The
 * TRUTHFULNESS RULE binds every declaration in src/shared/judge-contracts/:
 * a contract describes what the code DOES today, never what it should do.
 * Debts are recorded, not papered over; papering one over is the same lie as
 * a guard that quietly stops firing.
 */

/** A concern the site handles the ideal way is declared with the plain
 *  value; a concern it does NOT handle is declared as an object whose one
 *  field names the deviation and whose value is the REASON, in prose. The
 *  reason is load-bearing: it is what makes the debt reviewable instead of
 *  accidental (the poll-subject/photo/moderation lanes were permanent by
 *  ACCIDENT — nothing anywhere said so). */

/** Versioned prompt bytes: an `llm_prompts` registry kind, or declared debt. */
export type PromptKindDecl =
  | string
  | { readonly unversioned: string }
  | { readonly inline: string };

/** Versioned rule semantics: the `*-rule.ts` release file (path relative to
 *  src/), or declared debt. */
export type RuleDecl =
  | { readonly releaseFile: string; readonly note?: string }
  | { readonly unversionedRule: string };

/** Buy-judgment-once memory. `claim_verdicts` is THE ledger; the relevance
 *  gate's parallel table is a declared divergence, not a secret one. */
export type LedgerDecl =
  | 'claim_verdicts'
  | { readonly ownTable: string; readonly why: string }
  | { readonly unledgered: string };

/** When a stored verdict may be re-bought. `{ final }` is the DECLARED
 *  permanent decision — permanence with a reason, never by accident.
 *  `debt` is EXPLICIT: true means "permanent only because no reopen
 *  mechanism exists yet" (scored DEBT by the audit); false means an
 *  owner-ruled permanence that IS the ideal shape (scored OK). A boolean
 *  the compiler requires, never a magic prefix on the prose — the audit
 *  used to score by whether the reason STARTED with 'DECLARED DEBT', which
 *  a reworded sentence silently flipped to OK. */
export type ReopenDecl =
  | 'rule_version'
  | 'input_fingerprint'
  | 'prompt_hash'
  | { readonly final: string; readonly debt: boolean };

/** A lane whose claim key contains no folded text (UNFOLDED_CLAIM_KEY = 0
 *  in claim-lane-adapter.ts). */
export type FoldDecl = number | 'UNFOLDED' | { readonly noClaimKey: string };

/** Schema-forced structured output. Points at where the schema LIVES (a
 *  schemas file export, a rule file), because a schema change IS a rule
 *  bump ("related food terms" in a schema description caused
 *  cuisine-in-categories while the prompt said the opposite). */
export type ResponseSchemaDecl =
  | { readonly source: string }
  | { readonly unschemad: string };

/** D2 standard: every verdict carries a reason grounded in quoted evidence.
 *  `tripwire` names banned fold-class reason patterns — the 47-merge lesson:
 *  the judge announced every bad merge in its reason and nothing read it. */
export type ReasonPolicyDecl =
  | { readonly required: true; readonly tripwire?: readonly string[] }
  | { readonly none: string };

/** Gold ×3 certification: the script/fixture pair, or declared absence. */
export type CertSuiteDecl =
  | { readonly script: string; readonly fixtures?: string }
  | { readonly uncertified: string };

export interface FailureDecl {
  /** fail_open = errors pass the subject through; fail_closed = errors hold
   *  it. Declared, because both are correct somewhere and each is a bug
   *  where the other belongs. */
  readonly posture: 'fail_open' | 'fail_closed';
  /** Table/store that holds refusals and contract breaks, if any. */
  readonly quarantine?: string;
  /** The >90%-decline-class alarm (the 716-decline sweep's lesson). */
  readonly declineAlarm?: {
    readonly threshold: number;
    readonly minAttempts: number;
    readonly mechanism: string;
  };
}

/**
 * SEQUENCING AS A DECLARED FACT (owner order 2026-08-31). The R6 class —
 * the category edge builder full-replacing from a facet synthesis hadn't
 * populated (4,839 standing edges vs 0 populated facets on 2026-08-31) —
 * is an ORDERING bug, and ordering lived in runbook prose re-derived by
 * hand every load. Each dependency carries an SQL emptiness probe: the
 * documented "is the store I read populated?" question. In THIS pass the
 * probe is documentation the audit script prints with the canonical order;
 * the runtime tooth (an armed consumer refusing to run against an empty
 * dependency store) is the follow-up pass.
 */
export interface JudgeDependency {
  /** The lane (or registered consumer id) whose output this site reads. */
  readonly on: string;
  /** Why, in one line, citing the incident where known. */
  readonly why: string;
  /** Documented emptiness probe — NOT executed at runtime in this pass.
   *  Returning 0 rows means the dependency has not produced yet and the
   *  dependent MUST NOT run (it would derive from nothing). */
  readonly emptinessProbeSql: string;
}

export interface JudgeContract {
  /** Glossary plain name (docs/llm-systems-map.md) — for humans. */
  readonly plainName: string;
  /** The ledger lane string, unique across the registry. Sites that write
   *  no claim_verdicts rows still register their caller tag here-adjacent
   *  via `spend.caller`; `lane` stays the identity. */
  readonly lane: string;
  /** Where the decision site lives (file path(s) relative to src/). */
  readonly site: string;
  readonly promptKind: PromptKindDecl;
  readonly rule: RuleDecl;
  /** Canonical claim key SPEC in prose — what identifies ONE claim. The
   *  executable canonicalization stays in the lane adapter; this pass
   *  declares, it does not re-implement. */
  readonly claimKeySpec: string;
  readonly foldParticipation: FoldDecl;
  readonly reopenOn: ReopenDecl;
  readonly ledger: LedgerDecl;
  /** llm_decision_records mirroring — today 4 kinds, arbitrary. */
  readonly record: boolean;
  /** verdict-then-effect separation. `true` or a declared violation —
   *  attribute placement applies un-ledgered effects (the 47 merges). */
  readonly effectSeparation: true | { readonly violated: string };
  readonly responseSchema: ResponseSchemaDecl;
  readonly reasonPolicy: ReasonPolicyDecl;
  /** One-line declaration of WHAT the judge sees. Context starvation caused
   *  the 716-decline sweep; declaring the context makes it reviewable. */
  readonly context: string;
  readonly batching: 'interactive' | 'batch_rail' | 'either';
  /** Typed spend tags: the §24 usageCaller (must exist in
   *  GEMINI_CALLER_PROFILES) + the ledger workClass. */
  readonly spend: {
    readonly caller: string;
    /** Additional caller tags the same site legitimately uses (e.g. the
     *  entity-match prompt's interactive vs batch tags). */
    readonly extraCallers?: readonly string[];
    /** BATCH-RAIL purposes this site submits under (GeminiBatchService
     *  purposes, WITHOUT the 'gemini-batch.' ledger prefix — e.g.
     *  'collection_extraction', 'pooled.labels.vocabulary'). The batch rail
     *  is a spend identity like any caller tag: submit() warn-checks
     *  `gemini-batch.<purpose>` against the registry exactly as callLLMApi
     *  checks usageCaller, so a contract that rides the batch rail must
     *  declare it here or every submit logs uncontracted. */
    readonly batchPurposes?: readonly string[];
    readonly workClass: string;
  };
  readonly failure: FailureDecl;
  readonly certSuite: CertSuiteDecl;
  readonly dependsOn?: readonly JudgeDependency[];
}

/**
 * A NON-JUDGE CONSUMER in the sequencing DAG. The orderings the flip-list
 * and launch-load runbook state are not all judge→judge: the food-category
 * edge builder (deterministic, DerivedIndexJob) reads the facet dish
 * knowledge synthesis writes; the janitor's archive arm is what makes the
 * name court's upheld-ghost kills real. They carry no JudgeContract — they
 * pay no LLM — but the canonical order the registry emits must include
 * them, or the R6 class survives in the gap between the two documents.
 */
export interface DependentConsumer {
  /** Unique id, `consumer:` prefixed so it can never collide with a lane. */
  readonly id: string;
  readonly plainName: string;
  readonly site: string;
  readonly dependsOn: readonly JudgeDependency[];
}

export interface JudgeContractRegistry {
  readonly contracts: readonly JudgeContract[];
  readonly consumers: readonly DependentConsumer[];
}

/** Every caller tag the registry claims — the gateway's warn-mode set. */
export function registeredCallerTags(
  registry: JudgeContractRegistry,
): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const contract of registry.contracts) {
    tags.add(contract.spend.caller);
    for (const extra of contract.spend.extraCallers ?? []) tags.add(extra);
    // The batch rail's ledger caller tag for a purpose is
    // `gemini-batch.<purpose>` — registered so submit()'s warn-mode check
    // recognizes a declared batch purpose.
    for (const purpose of contract.spend.batchPurposes ?? []) {
      tags.add(`gemini-batch.${purpose}`);
    }
  }
  return tags;
}

/** Duplicate-lane refusal — two contracts claiming one lane is one verdict
 *  silently answering for a claim nobody heard, at the registry level. */
export function assertUniqueLanes(registry: JudgeContractRegistry): void {
  const seen = new Set<string>();
  for (const contract of registry.contracts) {
    if (seen.has(contract.lane)) {
      throw new Error(
        `JudgeContract registry declares lane '${contract.lane}' twice.`,
      );
    }
    seen.add(contract.lane);
  }
  for (const consumer of registry.consumers) {
    if (seen.has(consumer.id)) {
      throw new Error(
        `DependentConsumer id '${consumer.id}' collides with a lane.`,
      );
    }
    seen.add(consumer.id);
  }
}

export interface TopoResult {
  /** Dependency-first canonical order (a dependency precedes its readers). */
  readonly order: readonly string[];
  /** Non-empty means the DAG is broken — the audit fails on it. */
  readonly cycle: readonly string[];
}

/**
 * Topological sort over lanes + consumers. Emits the canonical sequencing
 * order — the reload runbook and flip-arming order become a GENERATED
 * artifact instead of hand-maintained prose (the R6 lesson). Kahn's
 * algorithm; ties broken alphabetically so the emitted order is stable.
 */
export function topoSort(registry: JudgeContractRegistry): TopoResult {
  const nodes = new Map<string, readonly JudgeDependency[]>();
  for (const c of registry.contracts) nodes.set(c.lane, c.dependsOn ?? []);
  for (const c of registry.consumers) nodes.set(c.id, c.dependsOn);

  const indegree = new Map<string, number>();
  const readers = new Map<string, string[]>();
  for (const id of nodes.keys()) indegree.set(id, 0);
  for (const [id, deps] of nodes) {
    for (const dep of deps) {
      if (!nodes.has(dep.on)) {
        throw new Error(
          `'${id}' dependsOn '${dep.on}', which is not a registered lane or consumer.`,
        );
      }
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      const list = readers.get(dep.on) ?? [];
      list.push(id);
      readers.set(dep.on, list);
    }
  }

  const ready = [...nodes.keys()].filter((id) => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const reader of (readers.get(id) ?? []).sort()) {
      const remaining = indegree.get(reader)! - 1;
      indegree.set(reader, remaining);
      if (remaining === 0) {
        ready.push(reader);
        ready.sort();
      }
    }
  }
  const cycle = [...nodes.keys()].filter((id) => !order.includes(id));
  return { order, cycle };
}
