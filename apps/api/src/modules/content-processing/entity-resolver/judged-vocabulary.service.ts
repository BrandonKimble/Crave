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
  ROLE_FRAME,
  ROLE_VENUE_CATEGORY,
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_RULE_VERSION,
  WORD_ROLE_LANE,
  WORD_ROLE_RULE_VERSION,
  normalizeClaimLocale,
  vocabularyLaneAdapter,
  wordGenericnessLane,
  wordNegationLane,
  wordRoleLane,
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
    [WORD_ROLE_LANE, new Map()],
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
              AND fold_version = ${wordNegationLane.keyFoldVersion})
          OR (lane = ${WORD_ROLE_LANE}
              AND rule_version = ${WORD_ROLE_RULE_VERSION}
              AND fold_version = ${wordRoleLane.keyFoldVersion})`;
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
          WORD_ROLE_LANE,
        ])
      )?.getTime() ?? 0;
    this.logger.info('Judged vocabulary loaded', {
      genericness: this.verdicts.get(WORD_GENERICNESS_LANE)?.size ?? 0,
      negation: this.verdicts.get(WORD_NEGATION_LANE)?.size ?? 0,
      role: this.verdicts.get(WORD_ROLE_LANE)?.size ?? 0,
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
    //
    // ONE HOLD LAW (foundation red team #3, 2026-08-16): the test is
    // `holdsUnjudged`, the SAME predicate the deferred demand door applies —
    // genericness AND word-role, both demand-hygiene facets. This used to
    // check genericness only, so a term whose role facet the hearing failed
    // to answer slipped through one door and was held at the other.
    const heldUnjudged = this.holdsUnjudged(text, claimLocale);
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
    const claimLocale = normalizeClaimLocale(locale);
    let held = false;
    for (const word of tokenize(text)) {
      const claim = { word, locale: claimLocale };
      // BOTH demand-hygiene facets must be in force before this term may be
      // recorded: genericness (is there an ask here at all) and word-role
      // (is this word frame — 'best' recorded as demand is the same defect
      // as 'de' recorded as demand, one law over). Negation is not consulted
      // by any demand writer, so it does not hold a term.
      if (
        !this.verdicts
          .get(WORD_GENERICNESS_LANE)
          ?.has(wordGenericnessLane.canonicalClaimKey(claim))
      ) {
        this.queue(WORD_GENERICNESS_LANE, claim);
        held = true;
      }
      if (!this.roleOf(word, claimLocale)) {
        this.queue(WORD_ROLE_LANE, claim);
        held = true;
      }
    }
    return held;
  }

  /**
   * THE DEMAND DOOR — judged before the write, and NEVER on the user's clock
   * (A5 + D2, 2026-08-15).
   *
   * `judgeThenStrip` is the same law with an LLM call inside it, and that call
   * is affordable exactly where its callers already await a model. It is NOT
   * affordable on the search path: `search.service` awaited it once per
   * grounded entity while a user watched a spinner, and the largest demand
   * ingress of all — the gazetteer's residue asks — skipped the door entirely
   * rather than pay for it, writing on_demand_ask and staging rows about RAW
   * terms nobody had judged. Both are the same mistake from opposite ends: a
   * blocking hearing is too expensive for this path, so one path paid and the
   * other cheated.
   *
   * This is the shape that costs nothing and cheats nothing. It reads the
   * in-memory table only — microseconds, no network — and:
   *
   *   - a term whose words are all judged is stripped and RECORDABLE now;
   *   - a term holding an unheard word is HELD, and that word is queued to
   *     the durable backlog the maintenance rail drains tonight.
   *
   * The held ask is not lost, and this is the property that makes deferral
   * honest rather than a dropped write: a demand signal exists because
   * somebody searched for something, and somebody who searches for something
   * once searches for it again. The next identical ask records normally,
   * against a verdict that was bought off the user's clock.
   */
  demandTerm(
    text: string,
    locale: string | null | undefined,
  ): { text: string; recordable: boolean } {
    const claimLocale = normalizeClaimLocale(locale);
    // HOLD FIRST: `holdsUnjudged` is what queues the misses, and a term is
    // held on the strength of ANY unheard word in it — stripping first would
    // let a judged word's verdict decide the fate of an unjudged neighbour.
    if (this.holdsUnjudged(text, claimLocale)) {
      return { text: '', recordable: false };
    }
    const stripped = this.stripGrammar(text, [], claimLocale);
    if (stripped.isGenericOnly || !stripped.text.trim().length) {
      return { text: stripped.text, recordable: false };
    }
    // THE ASK-SHAPE LAW, FROM VERDICTS (word-role, 2026-08-15). A frame word
    // wraps an ask without being one, so it may no more become a demand
    // record than a preposition may: 'best' recorded as demand is 'de'
    // recorded as demand, one lane over. And CATEGORIES ARE NOT DEMAND
    // (owner amendment, same day): a term must carry at least one
    // PARTICULAR word to be recordable; category words ride along in the
    // text but never make the term worth spending on by themselves.
    const framed = this.stripAskFrame(stripped.text, claimLocale);
    return {
      text: framed.text,
      recordable: !framed.isGenericOnly && framed.text.trim().length > 0,
    };
  }

  /**
   * THE WORD-ROLE VERDICT IN FORCE for one word: 'particular',
   * 'venue-category', 'frame' — or null when the word has not been heard on
   * this facet in this language. The certification buys BOTH the surface's
   * own locale and 'und' for every corpus word, because most real asks
   * arrive undetectable and reach here as 'und'.
   */
  roleOf(word: string, locale: string | null | undefined): string | null {
    // THE ASK'S OWN LANGUAGE ONLY — the genericness law, not negation's.
    // 'top' is an English frame word AND a real Vietnamese word; reading an
    // 'und' ruling into a vi-tagged ask would be the English-stop-list
    // defect reborn one lane over. An undetectable ask IS 'und', and 'und'
    // has its own certified verdicts; a locale-tagged miss stays null (and
    // is queued by the hold path), which is the conservative direction.
    return (
      this.verdicts
        .get(WORD_ROLE_LANE)
        ?.get(`${normalizeClaimLocale(locale)}|${surfaceClaimKey(word)}`) ??
      null
    );
  }

  /**
   * Remove the ask FRAME — every word ruled 'frame' on the word-role facet —
   * and report whether NOTHING else was there (`isGenericOnly`, kept under
   * the name its retired predecessor `stripGenericTokens` answered with,
   * because every caller composes it the same way).
   *
   * This is what retired `generic-token-handling.ts`: the English-only
   * ASK_FRAME_TOKENS / BARE_CATEGORY_TOKENS lists become per-language
   * verdicts, so a Vietnamese frame word is stripped in Vietnamese instead
   * of escaping judgement, and the bare-category suppression is now the
   * per-language `venue-category` verdict instead of seven English nouns.
   *
   * SEGMENT UNITS, BY POSITION — the same removal law as `stripGrammar`, for
   * the same two reasons (unspaced scripts have no word-boundary regex, and
   * a sealed compound is never cut by one character's verdict). An UNHEARD
   * word is kept: the conservative direction, and the hold path
   * (`holdsUnjudged`) is what keeps an unheard frame word out of demand.
   */
  stripAskFrame(
    text: string,
    locale: string | null | undefined,
  ): { text: string; isGenericOnly: boolean } {
    const claimLocale = normalizeClaimLocale(locale);
    const units = segmentStripUnits(text);
    if (!units.length) return { text: '', isGenericOnly: true };
    let out = '';
    let cursor = 0;
    // CATEGORIES ARE NOT DEMAND (owner amendment 2026-08-15, consensus
    // reversal). A venue-category word STAYS IN THE TEXT — 'coffee shops'
    // records as typed, never mangled to 'coffee' — but it does not by
    // itself make a term recordable: only a PARTICULAR word (or an unheard
    // one, conservatively) carries an ask worth spending on, so a term of
    // nothing but frame and category words reports `isGenericOnly`.
    let particularSurvivors = 0;
    let survivors = 0;
    for (const unit of units) {
      const role = this.roleOf(unit.word, claimLocale);
      out += text.slice(cursor, unit.start);
      if (role !== ROLE_FRAME) {
        out += unit.word;
        survivors += 1;
        if (role !== ROLE_VENUE_CATEGORY) particularSurvivors += 1;
      }
      cursor = unit.end;
    }
    out += text.slice(cursor);
    out = out.replace(/\s+/g, ' ').trim();
    out = out.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return {
      text: survivors ? out : '',
      isGenericOnly: particularSurvivors === 0,
    };
  }

  /**
   * Hear every claim here that has no verdict, ON EVERY FACET AT ONCE.
   *
   * CO-DUE, NOT LOOPED (B-call, 2026-08-15). This used to call the judge once
   * per lane, so the same forty words were sent to the same model twice —
   * twice the tokens, twice the round trips, twice the ways to fail, for one
   * lookup of one thing. `certifyFacets` asks both facets in one call and
   * writes two independent verdict rows; the facets keep their own rule, own
   * version and own key space, because they are genuinely two questions. What
   * they share is the subject, which is exactly what a batch is.
   */
  async ensureJudged(
    claims: readonly WordVocabularyClaim[],
    lanes: readonly string[] = [
      WORD_GENERICNESS_LANE,
      WORD_NEGATION_LANE,
      WORD_ROLE_LANE,
    ],
  ): Promise<void> {
    if (!claims.length) return;
    const due = lanes.filter((lane) => {
      const adapter = vocabularyLaneAdapter(lane);
      const table = this.verdicts.get(lane);
      return claims.some(
        (claim) => !table?.has(adapter.canonicalClaimKey(claim)),
      );
    });
    if (!due.length) return;
    try {
      await this.judge.certifyFacets(due, claims);
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
        for (const lane of due) {
          for (const claim of claims) this.queue(lane, claim);
        }
        this.logger.warn('Vocabulary hearing deferred to the backlog', {
          lanes: due,
          words: claims.length,
          reason: error.name,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * THE FIRST-SEARCH SYNC HEARING (foundation red team #7, 2026-08-16;
   * owner accepted first-search latency for correctness).
   *
   * The claims here that are missing a verdict on ANY due lane get ONE
   * bounded chance to be heard on the asker's own clock: the hearing races a
   * timeout, and whichever wins, the search proceeds.
   *
   *   - 'none': every word is already judged — ZERO awaits, the promise
   *     resolves synchronously-fast with no hearing started. This is the
   *     common case forever, because a hearing happens once per word.
   *   - 'judged': the hearing settled inside the budget; the verdict is in
   *     the in-memory table (the judge's subscribe hook) and the SAME
   *     request's browse/demand reads see it.
   *   - 'timeout': today's semantics. The hearing is NOT cancelled — the
   *     verdict lands for the next search — and the words are queued
   *     durably so a hearing that dies in flight is still owed to the
   *     nightly drain.
   *
   * The timeout is the CALLER's number, because it is a latency-budget fact
   * about the caller's surface, not about this service.
   */
  async ensureJudgedWithin(
    claims: readonly WordVocabularyClaim[],
    timeoutMs: number,
  ): Promise<'none' | 'judged' | 'timeout'> {
    const novel = this.unjudgedOnAnyLane(claims);
    if (!novel.length) return 'none';
    const hearing = this.ensureJudged(novel);
    const outcome = await new Promise<'judged' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), timeoutMs);
      // A rejected hearing still resolves 'judged' here: it is SETTLED — the
      // fallback below (holdsUnjudged / the read door) queues what stayed
      // unheard, exactly as it always has.
      hearing.then(
        () => {
          clearTimeout(timer);
          resolve('judged');
        },
        () => {
          clearTimeout(timer);
          resolve('judged');
        },
      );
    });
    if (outcome === 'timeout') {
      // Durable row now, in case the in-flight hearing dies with the
      // process; a completed hearing simply leaves nothing for the drain.
      for (const claim of novel) this.queueOnMissingLanes(claim);
      void hearing.catch(() => undefined);
    }
    return outcome;
  }

  /** The claims here with no verdict in force on at least one vocabulary
   *  lane — the dueness read `ensureJudgedWithin` gates its await on. */
  private unjudgedOnAnyLane(
    claims: readonly WordVocabularyClaim[],
  ): WordVocabularyClaim[] {
    const lanes = [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE, WORD_ROLE_LANE];
    return claims.filter((claim) =>
      lanes.some((lane) => {
        const adapter = vocabularyLaneAdapter(lane);
        return !this.verdicts.get(lane)?.has(adapter.canonicalClaimKey(claim));
      }),
    );
  }

  /** Queue this claim for the drain on every lane still missing a verdict. */
  private queueOnMissingLanes(claim: WordVocabularyClaim): void {
    for (const lane of [
      WORD_GENERICNESS_LANE,
      WORD_NEGATION_LANE,
      WORD_ROLE_LANE,
    ]) {
      const adapter = vocabularyLaneAdapter(lane);
      if (!this.verdicts.get(lane)?.has(adapter.canonicalClaimKey(claim))) {
        this.queue(lane, claim);
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
    // THE LANE'S ADAPTER SPELLS THE KEY, never this method (foundation red
    // team #4, 2026-08-16). A hand-built `${locale}|${form}` queued negation
    // rows under per-locale keys, but negation's canonical key is
    // `und|${form}` — so the drain's delete predicate (which asks the
    // adapter) never matched, and an answered word sat in the queue forever.
    const claimKey = vocabularyLaneAdapter(lane).canonicalClaimKey({
      word: claim.word,
      locale,
    });
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
    // FINISH BEFORE BUYING (the H5 resume seam, closed for the steady rail
    // 2026-08-19). A crash between `record` and `markExecuted` leaves a
    // verdict whose executed stamp never landed; the judge's
    // `resumePendingEffects` existed, but only the operator's
    // certify-vocabulary script ever called it — the nightly, the one caller
    // that runs unattended, let the resume queue grow forever. The effect
    // here is cheap (re-notify the cache, stamp the row), so the drain
    // settles yesterday's books before opening today's docket.
    for (const lane of [
      WORD_GENERICNESS_LANE,
      WORD_NEGATION_LANE,
      WORD_ROLE_LANE,
    ]) {
      await this.judge.resumePendingEffects(lane);
    }
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
      const adapter = vocabularyLaneAdapter(lane);
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
      WORD_ROLE_LANE,
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
    const adapter = vocabularyLaneAdapter(lane);
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
