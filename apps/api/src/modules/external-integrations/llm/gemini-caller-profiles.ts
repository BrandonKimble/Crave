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
   *  residue.interpret deliberately track. */
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

/**
 * MODEL-TIER STRATEGY (owner-ordered, prompt-fleet rederivation 2026-08-11).
 * A caller's model is a DECISION recorded here, never an inheritance:
 *
 * - EXTRACTION stays on the session default (the proven older flash tier) —
 *   empirically best at collection extraction; the prompt A/B harness is the
 *   only instrument allowed to move it.
 * - JUDGMENT lanes whose mistakes are expensive and whose volume is not
 *   (entity merges, word ownership, Places grounding, dish knowledge) run
 *   the smarter FLASH tier. The delta at their volumes is single-digit
 *   dollars/month; one wrong merge or one wrong grounding costs more.
 * - MECHANICAL classification (a fixed label set, no world reconciliation)
 *   stays FLASH_LITE — a smarter model buys nothing on an enum.
 *
 * Every switch is MEASURABLE, not asserted: the ledger's caller column is
 * the cost before/after, and the decision ledger records `model` on every
 * entity-match / attribute-placement / moderation decision, so a quality
 * regression after a tier change is a queryable diff, not a vibe.
 */
export const GEMINI_CALLER_PROFILES: Record<string, GeminiCallerProfile> = {
  // ---- collection / extraction ----
  // Session default ON PURPOSE (proven tier for extraction; see strategy
  // note above — moves only via the prompt A/B harness).
  'content.extract': { context: 'content', maxOutputTokens: MODEL_MAX_OUTPUT },
  'residue.interpret': {
    // Unsegmented-residue drain (background cron) — the lane's only caller;
    // renamed from 'query.interpret' 2026-08-11 when live search went
    // gazetteer-only. Historic ledger rows keep the old caller string.
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
  // ---- mechanical classification tier (flash-lite, DELIBERATE) ----
  // These map text onto a fixed label set (cuisine names, allow/block,
  // ranked/discussion, hub/not, keep/drop, a verbatim pick from a list).
  // No world reconciliation, no destructive merge — the smarter tier buys
  // nothing on an enum (tier strategy 2026-08-11).
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
  // JUDGMENT, not mechanical (tier strategy 2026-08-11): a wrong `select`
  // grounds a restaurant to the WRONG Google place — grounding is ~$0.045
  // a location, place-grounded restaurants are never deleted, and every
  // downstream photo/hours/geo fact inherits the error. 8,872 reqs/30d at
  // ~930 in-tokens each ≈ 8.3M in-tokens: the LITE→FLASH delta is ~$2/mo
  // against that failure mode. Chooser decisions are staged (reject =
  // retrieve more), so quality shifts show up as select/reject rate per
  // caller in the ledger.
  'places.choose_candidate': {
    model: FLASH,
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
  // JUDGMENT + generative world knowledge (tier strategy 2026-08-11): an
  // invented ingredient misleads a dietary-constrained diner and a bad
  // alias fuses two dishes in search. Was implicit session-default; now an
  // EXPLICIT flash pin so a session-model change cannot silently retier it.
  // Volume is the sweep watermark (497 calls/30d), and the lane now rides
  // the pooled batch path at half price (dish-knowledge-synthesis.service).
  'dish.knowledge_synthesize': {
    model: FLASH,
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
  // THE WORD-CLAIM ADJUDICATOR (claims registry, concept-graph §9.9). Runs
  // ONLY on contested surfaces — an inferred claim colliding with another
  // inferred claim — so volume is the conflict backlog, not the corpus.
  // FLASH, not LITE (tier strategy 2026-08-11): this is a persisted RULING
  // that takes a search word away from a concept — cross-locale nuance
  // (bò/bơ, near-synonym vs containment) is exactly where the smarter tier
  // earns its keep, and at 757 reqs/30d (~1M in-tokens) the delta is
  // pennies. Verdict rows carry `reason`, so a tier regression is auditable
  // against the persisted record.
  'aliases.claim_judge': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // THE RESTAURANT-NAME COURT (C4a, 2026-08-16) — is this form genuinely a
  // name of this venue, or a generic word that landed as one? Evidence-heavy
  // cards (raw mention excerpts) and few claims per call (8); FLASH for the
  // same judgment-quality reason as the claim judge — the cases that matter
  // are Supper-vs-Stars, which a cheap tier reads as identical.
  'aliases.restaurant_name_judge': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  // THE JUDGED VOCABULARY (2026-08-13) — the two lanes that retired the query
  // path's last hand lists. One word, one language, one boolean; 40 words per
  // call, and each word is asked exactly once ever, so the whole certified
  // vocabulary is a few dollars and the steady state is the trickle of newly
  // banked words.
  // FLASH, not LITE, for the same reason as the claim judge: the answers that
  // matter are the cross-locale ones a cheap tier gets wrong — `chua` (sour)
  // against `chưa` (not yet), `it` in English against `ít` in Vietnamese —
  // and every verdict is PERSISTED, so a tier regression is bought once and
  // read forever.
  'vocabulary.genericness_judge': {
    model: FLASH,
    context: 'query',
    maxOutputTokens: MODEL_MAX_OUTPUT,
  },
  'vocabulary.negation_judge': {
    model: FLASH,
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
