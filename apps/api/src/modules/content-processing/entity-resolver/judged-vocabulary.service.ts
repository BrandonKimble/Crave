import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { WordVocabularyJudgeService } from './word-vocabulary-judge.service';
import {
  DrainExceedsStandingCapError,
  NoMeasuredHearingRateError,
  StaleDrainApprovalError,
} from './claim-rehearing-budget.service';
import { surfaceClaimKey } from './entity-surface.service';
import { segmentWords } from '../../entity-text-search/query-analyzer';
import {
  CARRIES_CONCEPT,
  GRAMMATICAL_WORK,
  NEGATES,
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_RULE_VERSION,
  normalizeClaimLocale,
  wordGenericnessLane,
  wordNegationLane,
  type WordVocabularyClaim,
} from './word-vocabulary-lanes';

/**
 * THE DOOR — every place a standalone token becomes ACTIONABLE reads a verdict
 * here, and a token nobody has heard triggers a hearing.
 *
 * Two access shapes, because the consumers genuinely differ and pretending
 * otherwise is how the hand lists got their worst property (one list, read by
 * a hot path and a write path, tuned for neither):
 *
 *   - THE WRITE DOOR is `judgeThenStrip`, and it is ASYNC AND BLOCKING. Its
 *     callers are recording DEMAND — a keyword the collector will go and spend
 *     money searching for, an on-demand ask, a ranking impression. A demand
 *     signal is a durable record that steers future spend, so it may never be
 *     written about a token nobody has judged: the door hears the token first
 *     and writes second. These paths already await a database and an LLM
 *     elsewhere; one batched hearing on a cache miss is affordable, and the
 *     miss is once per word forever.
 *
 *   - THE READ DOOR is `strippedForEmbedding`, and it is SYNCHRONOUS. Its one
 *     caller runs per keystroke-search, where the analyzer's whole budget is
 *     microseconds; it reads the in-memory table and nothing else. An unheard
 *     token behaves exactly as it does today — NOT stripped, the conservative
 *     direction, costing one word of context to a semantic model — and is
 *     queued for the next hearing. The miss self-heals, once, per word.
 *
 * THE CACHE IS THE WHOLE POINT. `claim_verdicts` is the memory; this is a
 * read-through table in front of it, loaded at boot and updated the moment the
 * judge rules. It is bounded by the certified vocabulary (tens of thousands of
 * short strings) and it is invalidated by exactly two events: a verdict
 * arriving, and a rule or fold version moving — which changes the key space
 * and is handled by reloading, because at that point every stored answer
 * belongs to a question that is no longer being asked.
 */
export interface JudgedStrip {
  text: string;
  /** Nothing but grammatical work survived: there is no ask here. */
  isGenericOnly: boolean;
  /** At least one word still has no verdict, so this term may not be
   *  recorded as demand yet. The word is queued; the ask will be recordable
   *  next time it is made. */
  heldUnjudged: boolean;
}

@Injectable()
export class JudgedVocabularyService implements OnModuleInit {
  private readonly logger: LoggerService;

  /** lane → claimKey → outcome. The verdicts in force, nothing else. */
  private readonly verdicts = new Map<string, Map<string, string>>([
    [WORD_GENERICNESS_LANE, new Map()],
    [WORD_NEGATION_LANE, new Map()],
  ]);

  /**
   * NEGATION IS READ ACROSS LANGUAGES, ON PURPOSE — and this is the set that
   * does it: every folded spelling ruled a negator in ANY certified language.
   *
   * It reproduces, exactly, what the cue lists did: the analyzer scanned every
   * installed language pack rather than the query's own, because "ramen sin
   * cerdo" typed on an en-US phone must still have `sin` withheld from the
   * embedder. The fused locale of a two-word query is a soft prior and a wrong
   * one often; the cost of stripping a negator that belonged to another
   * language is one word of context, and the cost of NOT stripping it is a
   * semantic model reading an exclusion as a request. The asymmetry is the
   * reason, and it has not changed.
   */
  private readonly negatingForms = new Set<string>();

  /** Words seen at the read door with no verdict, awaiting the next drain. */
  private readonly pending = new Map<string, WordVocabularyClaim>();

  private loaded = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly judge: WordVocabularyJudgeService,
  ) {
    this.logger = loggerService.setContext('JudgedVocabularyService');
    this.judge.subscribe((lane, key, outcome) =>
      this.remember(lane, key, outcome),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  /* ------------------------------------------------------------- the table */

  /** Load every verdict in force. Idempotent; safe to call again after a rule
   *  bump, which is the only thing that changes which verdicts are in force. */
  async load(): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      Array<{ lane: string; claim_key: string; outcome: string }>
    >`
      SELECT lane, claim_key, outcome
        FROM claim_verdicts
       WHERE (lane = ${WORD_GENERICNESS_LANE}
              AND rule_version = ${WORD_GENERICNESS_RULE_VERSION}
              AND fold_version = ${wordGenericnessLane.keyFoldVersion})
          OR (lane = ${WORD_NEGATION_LANE}
              AND rule_version = ${WORD_NEGATION_RULE_VERSION}
              AND fold_version = ${wordNegationLane.keyFoldVersion})`;
    for (const table of this.verdicts.values()) table.clear();
    this.negatingForms.clear();
    for (const row of rows) {
      this.remember(row.lane, row.claim_key, row.outcome);
    }
    this.loaded = true;
    this.logger.info('Judged vocabulary loaded', {
      genericness: this.verdicts.get(WORD_GENERICNESS_LANE)?.size ?? 0,
      negation: this.verdicts.get(WORD_NEGATION_LANE)?.size ?? 0,
      negators: this.negatingForms.size,
    });
  }

  private remember(lane: string, claimKey: string, outcome: string): void {
    this.verdicts.get(lane)?.set(claimKey, outcome);
    if (lane === WORD_NEGATION_LANE) {
      const form = claimKey.slice(claimKey.indexOf('|') + 1);
      if (outcome === NEGATES) this.negatingForms.add(form);
      else this.negatingForms.delete(form);
      // A form is a negator if ANY language says so, so a single non-negating
      // verdict may not erase another language's yes. Re-derive from the table
      // rather than trusting the last write to be the only one.
      if (outcome !== NEGATES) {
        for (const [key, value] of this.verdicts.get(lane) ?? []) {
          if (value === NEGATES && key.slice(key.indexOf('|') + 1) === form) {
            this.negatingForms.add(form);
            break;
          }
        }
      }
    }
  }

  /** Is the table populated? False before `load`, and the honest answer to
   *  "may I trust a miss" for anything that wants to know. */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /* ---------------------------------------------------------- the read door */

  /**
   * DENSE-INPUT HYGIENE — the one synchronous consumer. Remove the words this
   * query cannot mean positively before a semantic model reads the phrase.
   *
   * Returns the surviving text; EMPTY means the run was nothing but negators
   * and has no positive concept to embed, which tells the caller to skip the
   * dense attempt entirely. That is the all-cue-run⇒skip-dense rule, preserved
   * exactly — it is a fact about negation semantics, which is why it lives on
   * this lane and not on genericness.
   */
  strippedForEmbedding(text: string, locale: string | null): string {
    // SEGMENTED, NOT SPLIT ON WHITESPACE. The cue list could only ever see
    // whitespace-delimited words, which is why its own comment ruled out a
    // Mandarin pack as machinery that could not do its job: 不要肉 carries no
    // space to split on. Cutting at the analyzer's word boundaries is what
    // makes the zh half of this lane real rather than a no-op.
    const spans = segmentWords(text);
    if (!spans.length) return text;
    let out = '';
    let cursor = 0;
    let survivors = 0;
    for (const span of spans) {
      out += text.slice(cursor, span.start);
      cursor = span.end;
      const form = surfaceClaimKey(span.word);
      if (form && this.negatingForms.has(form)) continue;
      if (form && !this.hasNegationVerdict(form, locale)) {
        this.queue(WORD_NEGATION_LANE, {
          word: span.word,
          locale: locale ?? 'und',
        });
      }
      out += span.word;
      survivors += 1;
    }
    out += text.slice(cursor);
    return survivors ? out.replace(/\s+/g, ' ').trim() : '';
  }

  private hasNegationVerdict(form: string, locale: string | null): boolean {
    const table = this.verdicts.get(WORD_NEGATION_LANE);
    if (!table) return false;
    return (
      table.has(`${normalizeClaimLocale(locale)}|${form}`) ||
      table.has(`und|${form}`)
    );
  }

  /* --------------------------------------------------------- the write door */

  /**
   * JUDGE, THEN WRITE. Hears every token of `text` that has no genericness
   * verdict in its own language, then removes the ones ruled pure grammar.
   *
   * `isGenericOnly` means the term is made ENTIRELY of grammatical work — no
   * content word survived — and every caller treats that as "there is no ask
   * here", dropping the demand signal rather than recording a preposition.
   *
   * An unjudged token that survives the hearing (the judge declined to answer,
   * or the drain was capped) is treated as CONTENT and kept. That is the
   * conservative direction the module this replaces already chose, for the
   * same reason: an unstripped term is a slightly worse query, a wrongly
   * stripped one is a deleted ask.
   */
  async judgeThenStrip(
    text: string,
    locale: string | null | undefined,
  ): Promise<JudgedStrip> {
    const words = tokenize(text);
    if (!words.length) {
      return { text: '', isGenericOnly: true, heldUnjudged: false };
    }
    const claimLocale = normalizeClaimLocale(locale);
    const claims = words.map((word) => ({ word, locale: claimLocale }));
    await this.ensureJudged(claims);

    // HELD, NOT GUESSED (2026-08-13). A hearing can fail to answer — the
    // rolling allowance is spent, the judge declined the case, the call
    // errored. The term then contains a word with no verdict, and the demand
    // door's whole rule is that such a word may not be recorded: recording it
    // is how `de` and 的 became demand signals in the first place. So the term
    // is HELD (its caller skips it) and the word stays queued, and the next
    // drain makes the same ask recordable. Nothing is guessed and nothing is
    // lost permanently — the ask recurs, and by then the word is judged.
    const table = this.verdicts.get(WORD_GENERICNESS_LANE);
    let heldUnjudged = false;
    for (const claim of claims) {
      if (table?.has(wordGenericnessLane.canonicalClaimKey(claim))) continue;
      this.queue(WORD_GENERICNESS_LANE, claim);
      heldUnjudged = true;
    }
    return { ...this.stripGrammar(text, words, claimLocale), heldUnjudged };
  }

  /**
   * The same strip WITHOUT hearing anything — what the write door does once
   * its hearing has returned, and what a replay or offline caller wants.
   *
   * REMOVAL IS BY POSITION, NOT BY WORD-BOUNDARY REGEX. The obvious
   * implementation — replace each grammatical word between `\p{L}` boundaries
   * — is silently a no-op in every unspaced script: in 好吃的 the particle 的
   * is preceded by a letter, so no boundary exists and the exact defect this
   * lane was built to fix (zh particles polluting demand signals) survives the
   * fix. The tokenizer already knows where each word starts and ends; cutting
   * there works in every script and keeps the punctuation and casing between
   * words that the caller meant to keep.
   */
  stripGrammar(
    text: string,
    _words: readonly string[],
    claimLocale: string,
  ): { text: string; isGenericOnly: boolean } {
    const table = this.verdicts.get(WORD_GENERICNESS_LANE);
    const spans = segmentWords(text);
    if (!spans.length) return { text: '', isGenericOnly: true };
    let out = '';
    let cursor = 0;
    let survivors = 0;
    for (const span of spans) {
      const grammar =
        table?.get(`${claimLocale}|${surfaceClaimKey(span.word)}`) ===
        GRAMMATICAL_WORK;
      out += text.slice(cursor, span.start);
      if (!grammar) {
        out += span.word;
        survivors += 1;
      }
      // A removed word is OMITTED, never replaced by a space: in an unspaced
      // script a substituted space is a word boundary the language does not
      // have, and it changes the string the embedder reads.
      cursor = span.end;
    }
    out += text.slice(cursor);
    out = out.replace(/\s+/g, ' ').trim();
    out = out.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return { text: survivors ? out : '', isGenericOnly: survivors === 0 };
  }

  /** Does this text still contain a word with no genericness verdict? The
   *  same HOLD test `judgeThenStrip` applies, for callers that batch their
   *  hearing across many terms and then strip each one. */
  holdsUnjudged(text: string, locale: string | null | undefined): boolean {
    const table = this.verdicts.get(WORD_GENERICNESS_LANE);
    const claimLocale = normalizeClaimLocale(locale);
    let held = false;
    for (const word of tokenize(text)) {
      const claim = { word, locale: claimLocale };
      if (table?.has(wordGenericnessLane.canonicalClaimKey(claim))) continue;
      this.queue(WORD_GENERICNESS_LANE, claim);
      held = true;
    }
    return held;
  }

  /** Hear every claim here that has no verdict, on BOTH lanes. Batched; the
   *  budget gate inside the judge bounds it. */
  async ensureJudged(claims: readonly WordVocabularyClaim[]): Promise<void> {
    if (!claims.length) return;
    for (const lane of [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE]) {
      const adapter =
        lane === WORD_GENERICNESS_LANE ? wordGenericnessLane : wordNegationLane;
      const table = this.verdicts.get(lane);
      const unheard = claims.filter(
        (claim) => !table?.has(adapter.canonicalClaimKey(claim)),
      );
      if (!unheard.length) continue;
      try {
        await this.judge.certify(lane, unheard);
      } catch (error) {
        // A REFUSED DRAIN IS NOT A FAILED REQUEST. The budget gate exists to
        // stop an unbounded spend, and it fires on the ordinary day when a
        // large certification has already used the window. Letting it escape
        // aborted the caller's ENTIRE batch — one unheard word cost a whole
        // page of demand signals. The words go on the backlog and the caller
        // holds the terms that needed them; the drain records the rest.
        if (
          error instanceof DrainExceedsStandingCapError ||
          error instanceof StaleDrainApprovalError ||
          error instanceof NoMeasuredHearingRateError
        ) {
          for (const claim of unheard) this.queue(lane, claim);
          this.logger.warn('Vocabulary hearing deferred to the backlog', {
            lane,
            words: unheard.length,
            reason: error.name,
          });
          continue;
        }
        throw error;
      }
    }
  }

  /* ----------------------------------------------------------- the backlog */

  private queue(lane: string, claim: WordVocabularyClaim): void {
    const key = `${lane}|${normalizeClaimLocale(claim.locale)}|${surfaceClaimKey(claim.word)}`;
    if (this.pending.has(key) || this.pending.size >= 5_000) return;
    this.pending.set(key, {
      word: claim.word,
      locale: normalizeClaimLocale(claim.locale),
    });
  }

  /** Words the read door met unjudged. Drained by the maintenance rail; the
   *  hot path never pays for them. */
  pendingHearings(): WordVocabularyClaim[] {
    return [...this.pending.values()];
  }

  /** Hear the backlog and forget it. Returns how many words were heard. */
  async drainPending(): Promise<number> {
    const claims = this.pendingHearings();
    this.pending.clear();
    if (!claims.length) return 0;
    await this.ensureJudged(claims);
    return claims.length;
  }

  /* ---------------------------------------------------------------- probes */

  /** The verdict in force for one word, or null when it has not been heard.
   *  The audit read every gate and script uses. */
  outcomeOf(
    lane: string,
    word: string,
    locale: string | null | undefined,
  ): string | null {
    const adapter =
      lane === WORD_GENERICNESS_LANE ? wordGenericnessLane : wordNegationLane;
    return (
      this.verdicts
        .get(lane)
        ?.get(adapter.canonicalClaimKey({ word, locale: locale ?? 'und' })) ??
      null
    );
  }

  /** True when this exact spelling was ruled a negator in some language. */
  negates(word: string): boolean {
    return this.negatingForms.has(surfaceClaimKey(word));
  }

  /** True when this word carries a concept in this language. */
  carriesConcept(word: string, locale: string | null | undefined): boolean {
    return (
      this.outcomeOf(WORD_GENERICNESS_LANE, word, locale) === CARRIES_CONCEPT
    );
  }
}

/** The words of a string, as the ANALYZER cuts them — per-character inside an
 *  unspaced CJK run, so a Mandarin particle is a word that can hold a verdict.
 *  Every caller of the door tokenizes through here, so the claim keys a
 *  hearing buys are exactly the ones the strip later looks up. */
export function tokenize(value: string): string[] {
  return segmentWords(value).map((span) => span.word);
}
