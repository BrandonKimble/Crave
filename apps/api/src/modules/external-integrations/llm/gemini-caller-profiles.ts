import type { ThinkingContext } from './gemini-thinking';

/**
 * THE per-caller configuration table, keyed by the §24 usageCaller tag —
 * the same key the usage ledger records, so "what we configured" and "what
 * it cost" join on one column.
 *
 * Why this exists: every cost bug this month was the same defect — N
 * request assemblers each independently remembering cross-cutting truths
 * (model choice, thinking level, output ceiling), and one forgetting.
 * Before this table, the model literal lived at 8 call sites, the output
 * ceiling was copy-pasted at 14, and the per-caller thinking lever existed
 * but had no source of values. A caller's configuration now has exactly one
 * home.
 *
 * VALUES ARE COPIED FACTS, not choices made here: each entry is what its
 * call site already used, moved. Changing a caller's economics is a
 * one-line diff in this file with the ledger's `caller` column as the
 * before/after measurement.
 *
 * OUTPUT CEILING POLICY (moved from the match_batch site, burned-in
 * 2026-07-07): budgets are model-max (65,536) everywhere. A budget's only
 * job is capping runaway cost (~pennies at max); a too-small one SILENTLY
 * truncates — thinking tokens bill against it unpredictably — and every
 * parser then fails open (moderation would auto-ALLOW) or closed (judges
 * spawn duplicate entities). Proven: match_batch at 4096 truncated mid-JSON
 * and every item failed closed. Do NOT lower a ceiling without replaying
 * that lesson.
 */
export interface GeminiCallerProfile {
  /** Vendor model id. Omitted = the session-configured default model
   *  (llm.model / llm.queryModel), which content.extract and
   *  query.interpret deliberately track. */
  model?: string;
  /** Thinking context for gemini-thinking's defaults (query = cheap
   *  classify/parse -> MINIMAL; content = extraction -> LOW). */
  context: ThinkingContext;
  /** See OUTPUT CEILING POLICY above. */
  maxOutputTokens: number;
  /** Explicit per-caller thinking level. DELIBERATELY unset everywhere
   *  today: inventing levels would be fake estimates. The seam exists so a
   *  MEASURED level is a one-line change when evidence arrives. */
  thinkingLevel?: string;
  /** Per-call abort ceiling (F122 / D16). Omitted = the session default
   *  (llm.timeout), the long hang-guard content extraction needs.
   *
   *  This used to be a ternary copy-pasted verbatim at four call sites —
   *  'query-class calls abort fast because a user is waiting' is a
   *  cross-cutting truth every new query-class caller had to REMEMBER,
   *  which is the exact seam this table exists to close (model, output
   *  ceiling and thinking context already moved here; the timeout was left
   *  behind). The former `llm.queryTimeout` config key had these four
   *  readers and nothing else, so its value moved here rather than being
   *  duplicated. */
  timeoutMs?: number;
}

/** Interactive query-path abort ceiling: user-facing calls must fail FAST.
 *  30s is the value the four query-class sites already used (formerly
 *  configuration.ts `llm.queryTimeout`, a literal with no env override —
 *  moved, not changed). */
const INTERACTIVE_QUERY_TIMEOUT_MS = 30_000;

const FLASH = 'gemini-3-flash-preview';
const FLASH_LITE = 'gemini-3.1-flash-lite-preview';
const MODEL_MAX_OUTPUT = 65536;

export const GEMINI_CALLER_PROFILES: Record<string, GeminiCallerProfile> = {
  // ---- collection / extraction ----
  'content.extract': { context: 'content', maxOutputTokens: MODEL_MAX_OUTPUT },
  'query.interpret': {
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
    timeoutMs: INTERACTIVE_QUERY_TIMEOUT_MS,
  },
  // ---- entity resolution ----
  'entity-resolution.match': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'entity-resolution.match_batch': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // ---- classify / judge tier (flash-lite) ----
  'cuisine.extract': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
    timeoutMs: INTERACTIVE_QUERY_TIMEOUT_MS,
  },
  'moderation.classify': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
    timeoutMs: INTERACTIVE_QUERY_TIMEOUT_MS,
  },
  'poll.infer_subject': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'attribute.canonicalize_name': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'cuisine.classify_hubs': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'places.choose_candidate': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
    timeoutMs: INTERACTIVE_QUERY_TIMEOUT_MS,
  },
  // ---- generative judges on the default model ----
  'attribute.place': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'dish.knowledge_synthesize': {
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // ---- former stragglers, folded into the gateway ----
  'relevance-gate.judgeBatch': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // ---- multilingual: the SPINE label seeder (M2, scripts/seed-spine-labels)
  // Flash-Lite tier on purpose: ~75 single-word terms, three samples, five
  // calls total. The expensive part of label quality is the CONSENSUS rule,
  // not the model size.
  'labels.seed_spine': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // THE VOCABULARY PASS (concept-graph plan). Flash-Lite, single draw, 20
  // concepts per call: measured 217 in / 182 out tokens per call, and 3 runs
  // x 6 anchors produced 100% agreement, so a bigger model or a consensus
  // triple would buy nothing. Whole-corpus cost across six locales is under
  // $10 at batch pricing.
  'labels.vocabulary': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // THE SUBSTITUTABILITY PASS. Same tier and reasoning as the vocabulary
  // pass: a stable, well-bounded classification over a short candidate list.
  // It only ever sees the RESIDUAL that grammar and the category graph could
  // not decide, so the volume is a fraction of the corpus.
  'concepts.satisfies': {
    model: FLASH_LITE,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'photos.is_food': {
    // gemini-2.5 tier: no thinking control exists (and no HIGH default to
    // guard against); a yes/no on a thumbnail needs no more model than this.
    model: 'gemini-2.5-flash-lite',
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
};

/** Per-caller thinking levels harvested from the profiles — the value
 *  source for gemini-thinking's perCaller channel. Empty today by design. */
export const PROFILE_THINKING_LEVELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(GEMINI_CALLER_PROFILES)
      .filter(([, profile]) => profile.thinkingLevel)
      .map(([caller, profile]) => [caller, profile.thinkingLevel!]),
  );

/** Profile lookup. Unknown callers return undefined — callLLMApi warns via
 *  its dead-man path and falls back to session defaults, because refusing
 *  the request over a missing table entry would turn a bookkeeping gap into
 *  an outage. The completeness SPEC is what keeps the table exhaustive. */
export function callerProfile(
  caller: string | undefined,
): GeminiCallerProfile | undefined {
  return caller ? GEMINI_CALLER_PROFILES[caller] : undefined;
}
