import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { WordVocabularyJudgeService } from './word-vocabulary-judge.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  DrainExceedsStandingCapError,
  NoMeasuredHearingRateError,
  StaleDrainApprovalError,
} from './claim-rehearing-budget.service';
import { surfaceClaimKey } from './entity-surface.service';
import { segmentStripUnits } from '../../entity-text-search/query-analyzer';
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

  /** max(decided_at) as of the last load — the version stamp `refreshIfChanged`
   *  compares against so another process's verdicts become visible. */
  private loadedStamp = 0;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly judge: WordVocabularyJudgeService,
    private readonly ledger: ClaimVerdictLedgerService,
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
    this.loadedStamp =
      (
        await this.ledger.latestDecidedAt([
          WORD_GENERICNESS_LANE,
          WORD_NEGATION_LANE,
        ])
      )?.getTime() ?? 0;
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
  /**
   * NO LOCALE PARAMETER, and its absence is the point (B-key, 2026-08-15).
   * This door reads the negation lane, whose claim unit is now the spelling
   * alone — a form ruled a negator anywhere is withheld everywhere, which is
   * what the cue lists did and what the ruling upheld. Taking a locale it
   * cannot consult would be a signature that lies about the decision.
   */
  strippedForEmbedding(text: string): string {
    // SEGMENTED, NOT SPLIT ON WHITESPACE. The cue list could only ever see
    // whitespace-delimited words, which is why its own comment ruled out a
    // Mandarin pack as machinery that could not do its job: 不要肉 carries no
    // space to split on. Cutting at the analyzer's word boundaries is what
    // makes the zh half of this lane real rather than a no-op.
    // THE STRIP UNIT IS THE SEGMENT, NOT THE CHARACTER (A4) — see
    // `segmentStripUnits`. 无糖奶茶 is ONE unit here, so 无's own verdict can
    // never turn sugar-free milk tea into sugar milk tea.
    const units = segmentStripUnits(text);
    if (!units.length) return text;
    let out = '';
    let cursor = 0;
    let survivors = 0;
    for (const unit of units) {
      out += text.slice(cursor, unit.start);
      cursor = unit.end;
      const form = surfaceClaimKey(unit.word);
      if (form && this.negatingForms.has(form)) continue;
      if (form && !this.hasNegationVerdict(form)) {
        // The hearing is bought for the UNIT, which is the thing a verdict
        // would delete. A sealed compound (无糖, 不辣) gets its own question,
        // asked at the only level where it has a true answer.
        this.queue(WORD_NEGATION_LANE, { word: unit.word, locale: 'und' });
      }
      out += unit.word;
      survivors += 1;
    }
    out += text.slice(cursor);
    return survivors ? out.replace(/\s+/g, ' ').trim() : '';
  }

  /** SPELLING ALONE (B-key): this lane's claim unit carries no locale, because
   *  its one consumer never reads one. */
  private hasNegationVerdict(form: string): boolean {
    return this.verdicts.get(WORD_NEGATION_LANE)?.has(`und|${form}`) ?? false;
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
    // SEGMENT UNITS, not characters (A4) — the same law the read door obeys.
    // 包子 is one unit, so 子's verdict cannot amputate a dish name into 包.
    const units = segmentStripUnits(text);
    if (!units.length) return { text: '', isGenericOnly: true };
    let out = '';
    let cursor = 0;
    let survivors = 0;
    for (const unit of units) {
      const grammar =
        table?.get(`${claimLocale}|${surfaceClaimKey(unit.word)}`) ===
        GRAMMATICAL_WORK;
      out += text.slice(cursor, unit.start);
      if (!grammar) {
        out += unit.word;
        survivors += 1;
      }
      // A removed word is OMITTED, never replaced by a space: in an unspaced
      // script a substituted space is a word boundary the language does not
      // have, and it changes the string the embedder reads.
      cursor = unit.end;
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
  async ensureJudged(
    claims: readonly WordVocabularyClaim[],
    lanes: readonly string[] = [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE],
  ): Promise<void> {
    if (!claims.length) return;
    for (const lane of lanes) {
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

  /**
   * QUEUE A WORD — in memory for this process, and in the DATABASE so the
   * question survives the process (A1, 2026-08-15).
   *
   * It was memory only, capped at 5,000, and NOTHING EVER DRAINED IT. Both
   * halves mattered: a queued word died on the next deploy, so the door's
   * "the miss self-heals, once, per word" promise could never come true, and
   * the 5,001st word of a busy hour was dropped on the floor with no record
   * that it had ever been asked about.
   *
   * The database write is FIRE-AND-FORGET, deliberately. This is called from
   * `strippedForEmbedding`, the synchronous per-keystroke read door whose
   * whole budget is microseconds; making the door await a write would put a
   * round trip on the hot path to record a chore. A lost enqueue costs one
   * more unstripped search, and the next search re-queues it.
   */
  private queue(lane: string, claim: WordVocabularyClaim): void {
    const locale = normalizeClaimLocale(claim.locale);
    const claimKey = `${locale}|${surfaceClaimKey(claim.word)}`;
    const key = `${lane}|${claimKey}`;
    if (this.pending.has(key)) return;
    this.pending.set(key, { word: claim.word, locale });
    void this.persistQueued(lane, claimKey, claim.word, locale).catch(
      (error: unknown) => {
        // The in-memory entry still stands and the next drain still offers it;
        // what is lost is only its survival across a restart. A door that
        // THREW here would turn a bookkeeping failure into a failed search.
        this.logger.warn('Hearing enqueue failed (word stays in memory only)', {
          lane,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      },
    );
  }

  /** `async` so that even a synchronous failure — no database bound at all,
   *  as in a unit test — arrives as a rejected promise the caller's `.catch`
   *  can absorb, rather than escaping into the hot path. */
  private async persistQueued(
    lane: string,
    claimKey: string,
    word: string,
    locale: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO vocabulary_hearing_queue (lane, claim_key, word, locale)
      VALUES (${lane}, ${claimKey}, ${word}, ${locale})
      ON CONFLICT (lane, claim_key) DO NOTHING`;
  }

  /** Words this PROCESS met unjudged since boot. The durable backlog is the
   *  table; this is what has not yet been written to it or drained from it. */
  pendingHearings(): WordVocabularyClaim[] {
    return [...this.pending.values()];
  }

  /**
   * HEAR THE BACKLOG — the maintenance rail's one job.
   *
   * Reads the DURABLE queue (not just this process's memory), hears what the
   * budget allows, and deletes only what actually got a verdict. A word the
   * budget refused stays queued, which is the difference between a backlog
   * and a bin: nothing is dropped because the allowance ran out, it simply
   * waits for tomorrow's window.
   */
  async drainPending(limit = 5_000): Promise<{
    queued: number;
    heard: number;
    remaining: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ lane: string; claim_key: string; word: string; locale: string }>
    >`
      SELECT lane, claim_key, word, locale
        FROM vocabulary_hearing_queue
       ORDER BY queued_at ASC
       LIMIT ${limit}`;
    // The in-memory set is a WRITE-BEHIND buffer for the table, so anything
    // whose insert lost the race is offered here too rather than waiting a
    // whole cycle for its next re-queue.
    const byKey = new Map<
      string,
      { lane: string; claim: WordVocabularyClaim }
    >();
    for (const row of rows) {
      byKey.set(`${row.lane}|${row.claim_key}`, {
        lane: row.lane,
        claim: { word: row.word, locale: row.locale },
      });
    }
    for (const [key, claim] of this.pending) {
      const lane = key.slice(0, key.indexOf('|'));
      if (!byKey.has(key)) byKey.set(key, { lane, claim });
    }
    if (!byKey.size) return { queued: 0, heard: 0, remaining: 0 };

    const byLane = new Map<string, WordVocabularyClaim[]>();
    for (const { lane, claim } of byKey.values()) {
      const bucket = byLane.get(lane) ?? [];
      bucket.push(claim);
      byLane.set(lane, bucket);
    }
    for (const [lane, claims] of byLane) {
      await this.ensureJudged(claims, [lane]);
    }

    // DELETE WHAT WAS ANSWERED, KEEP WHAT WAS NOT. The verdict table is the
    // authority on which it is — not the return value of the drain, which
    // cannot see a batch that failed inside the judge.
    let heard = 0;
    const answeredKeys: Array<[string, string]> = [];
    for (const [key, { lane, claim }] of byKey) {
      const adapter =
        lane === WORD_GENERICNESS_LANE ? wordGenericnessLane : wordNegationLane;
      if (!this.verdicts.get(lane)?.has(adapter.canonicalClaimKey(claim))) {
        continue;
      }
      heard += 1;
      answeredKeys.push([lane, key.slice(key.indexOf('|') + 1)]);
      this.pending.delete(key);
    }
    for (const [lane, claimKey] of answeredKeys) {
      await this.prisma.$executeRaw`
        DELETE FROM vocabulary_hearing_queue
         WHERE lane = ${lane} AND claim_key = ${claimKey}`;
    }
    const remaining = byKey.size - heard;
    this.logger.info('Vocabulary backlog drained', {
      queued: byKey.size,
      heard,
      remaining,
    });
    return { queued: byKey.size, heard, remaining };
  }

  /** How many words are waiting, durably — the ops-dashboard read. */
  async queuedHearingCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ queued: bigint }>>`
      SELECT count(*) AS queued FROM vocabulary_hearing_queue`;
    return Number(rows[0]?.queued ?? 0);
  }

  /* -------------------------------------------------- cross-process refresh */

  /**
   * NOTICE WHAT ANOTHER PROCESS RULED (A6, 2026-08-15).
   *
   * The cache is loaded once at boot and updated only by verdicts THIS
   * process's judge reached. So an operator running `certify-vocabulary`
   * bought 32,000 answers that the running API could not see until someone
   * restarted it — and in prod, where the worker runs the maintenance rail
   * and the api serves the door, the api NEVER saw them. A cache that cannot
   * hear about a verdict is a consumer still behaving as though the word were
   * unjudged, which is the exact unfinished effect this lane's
   * verdict-before-effect ordering exists to forbid.
   *
   * The channel is a CHEAP VERSION CHECK, not LISTEN/NOTIFY: one indexed
   * max(decided_at) per poll, and a full reload only when it moved. The
   * repo's other cross-process coordination is polled or advisory-locked over
   * the ordinary pool; a dedicated LISTEN connection held open for the life
   * of the process would be the first of its kind here, for a table that
   * changes a few times a day.
   */
  async refreshIfChanged(): Promise<boolean> {
    const latest = await this.ledger.latestDecidedAt([
      WORD_GENERICNESS_LANE,
      WORD_NEGATION_LANE,
    ]);
    const stamp = latest?.getTime() ?? 0;
    if (this.loaded && stamp === this.loadedStamp) return false;
    await this.load();
    return true;
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

/** The words of a string AS THE DOOR JUDGES THEM — the analyzer's boundaries
 *  with each unspaced CJK run kept whole (A4). Every caller of the door
 *  tokenizes through here, so the claim keys a hearing buys are exactly the
 *  ones the strip later looks up; buying per-character verdicts and then
 *  looking up per-segment would leave the whole zh half permanently unheard. */
export function tokenize(value: string): string[] {
  return segmentStripUnits(value).map((unit) => unit.word);
}
