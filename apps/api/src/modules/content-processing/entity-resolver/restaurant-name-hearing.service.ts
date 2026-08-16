import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { canonicalFold } from './entity-identity';
import { surfaceClaimKey } from './entity-surface.service';
import {
  PLACE_NAME_JUDGE_PROMPT,
  PLACE_NAME_RULE_FINGERPRINT,
  PLACE_NAME_RULE_VERSION,
} from './restaurant-name-rule';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import {
  PLACE_NAME_LANE,
  placeNameLane,
  type PlaceNameClaim,
} from './restaurant-name-lane';
import type { SurfaceTargetState } from './word-claim-adjudicator.service';

/**
 * THE RESTAURANT-NAME COURT (C4a) — the hearing a restaurant recall surface
 * never had.
 *
 * Restaurant recall surfaces are word-claims in another lane: they ground a
 * hard AND (the query "best tacos" containing an active surface `best` is
 * grounded to the restaurant "Best" and everything else is excluded), and
 * until this lane they NEVER faced a judge — the word lane's docket selects
 * food/concept sources, so a generic word minted as a restaurant name sat
 * unheard forever. The measured harm is C4a itself: the ghost "Best"
 * annihilated every "best X" search in the corpus.
 *
 * THE CLAIM this court hears: "this surface form is genuinely a name of this
 * restaurant entity." The judge decides from evidence — the entity's grounding
 * state, its other surfaces, its mention footprint — never from the word's
 * shape, because real names ARE generic words (Chili's, Magnolia, Favorite)
 * and hand-deleting them is the failure mode this lane replaces.
 *
 * WHAT A VERDICT DOES:
 *   - `notAName` → the form's recall claim on this entity dies. The target
 *     state is ABSOLUTE, computed at decision time and stored in the verdict's
 *     subject (a role='both' row degrades to 'display' so a rendered label
 *     survives; a pure recall row is deprecated) — a replay writes the same
 *     bytes, never re-derives a transition from a corpus that moved.
 *   - `isName` → nothing moves; the verdict IS the memory, and it is what
 *     stops the census re-offering the same settled question forever.
 *   - THE ENTITY IS NEVER TOUCHED. Entity survival — ghost deletion, place
 *     grounding — is the enrichment lifecycle's jurisdiction; this court rules
 *     on the NAME only.
 *
 * WHO FEEDS THE DOCKET: the generic-word census (the other session's subject
 * E) hands `hear()` batches of (entityId, form) specimens. This service is the
 * court and the verdict memory; it selects nothing corpus-wide itself. Every
 * hearing passes the standard gates — the due-predicate (already decided at
 * the rule and fold in force is not due) and the rehearing budget (a drain is
 * a spend event; beyond the rolling allowance it refuses with a quote).
 */

/** Claims packed into one LLM call. Mirrored by the lane's HEARING_METER. */
export const PLACE_NAME_CLAIMS_PER_CALL = 8;

/** What the verdict orders done — persisted as the verdict's subject, so a
 *  resumed effect replays the decision (stored bytes), never re-derives it. */
export interface PlaceNameEffect {
  entityId: string;
  form: string;
  /** Surfaces whose recall claim dies, each with the exact (role, status) the
   *  verdict puts it in. Empty on `isName` and on a `notAName` whose form no
   *  longer holds a live recall row. */
  takeName: SurfaceTargetState[];
}

export interface PlaceNameCase {
  entityId: string;
  form: string;
  placeName: string;
  outcome: 'isName' | 'notAName';
  reason: string;
  /** Surface rows the verdict deprecated / degraded (0 under dryRun). */
  surfacesTaken: number;
}

export interface PlaceNameHearingSummary {
  considered: number;
  /** Skipped without paying: no active restaurant entity behind the claim. */
  noSuchPlace: number;
  /** Skipped without paying: already decided at the rule + fold in force. */
  alreadyDecided: number;
  judged: number;
  namesUpheld: number;
  namesDenied: number;
  /** Judge unavailable / blank-reason answer — left undecided, offered again. */
  unjudged: number;
  cases: PlaceNameCase[];
}

interface PreparedCase {
  claim: PlaceNameClaim;
  placeName: string;
  card: string;
  /** Live recall rows this form holds on the entity — what a NO takes. */
  held: Array<{ surfaceId: string; role: string; status: string }>;
}

@Injectable()
export class PlaceNameHearingService {
  /** Excerpts quoted on a card — enough to show a usage pattern, small
   *  enough that eight cards still fit one judge call. */
  static readonly SNIPPETS_PER_CARD = 5;
  /** Documents fetched and scanned for occurrences of the form — a bound on
   *  the text pulled per hearing, newest first. The card states the TOTAL
   *  document count separately, so the bound never misrepresents reach. */
  static readonly SNIPPET_DOCS_SCANNED = 40;
  /** Characters kept on each side of an occurrence. */
  static readonly SNIPPET_WINDOW = 120;

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    loggerService: LoggerService,
    private readonly ledger: ClaimVerdictLedgerService,
    private readonly budget: ClaimRehearingBudgetService,
  ) {
    this.logger = loggerService.setContext('PlaceNameHearingService');
  }

  /**
   * FINISH WHAT WAS ALREADY DECIDED, BEFORE DECIDING ANYTHING NEW
   * (H5 amendment (c)). A verdict commits before its effect runs; a process
   * that dies in between leaves a paid decision the corpus has not obeyed.
   * Resuming replays the STORED subject — the same bytes the verdict froze.
   */
  async resumePendingEffects(limit = 500): Promise<number> {
    const pending = await this.ledger.pendingExecution<PlaceNameEffect>(
      PLACE_NAME_LANE,
      limit,
    );
    let resumed = 0;
    for (const verdict of pending) {
      await this.applyEffect(verdict.subject);
      await this.ledger.markExecuted(
        PLACE_NAME_LANE,
        verdict.claimKey,
        verdict.ruleVersion,
        verdict.foldVersion,
      );
      resumed += 1;
    }
    if (resumed) {
      this.logger.info(
        'Resumed decided-but-unexecuted restaurant-name verdicts',
        { resumed },
      );
    }
    return resumed;
  }

  /**
   * HEAR THESE CLAIMS — the docket-feed entry point the census calls, and the
   * one place a restaurant-name hearing can be paid for. Dedupe by claim key,
   * subtract the already-decided, pass the budget gate, then judge in batches.
   */
  async hear(
    claims: PlaceNameClaim[],
    options: { dryRun?: boolean; approvedHash?: string | null } = {},
  ): Promise<PlaceNameHearingSummary> {
    const dryRun = options.dryRun ?? true;
    const summary: PlaceNameHearingSummary = {
      considered: 0,
      noSuchPlace: 0,
      alreadyDecided: 0,
      judged: 0,
      namesUpheld: 0,
      namesDenied: 0,
      unjudged: 0,
      cases: [],
    };

    // One hearing per claim unit.
    const seen = new Set<string>();
    const deduped = claims.filter((claim) => {
      const key = placeNameLane.canonicalClaimKey(claim);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    summary.considered = deduped.length;

    // THE DUE-PREDICATE, AT THE CHOKEPOINT: already decided is not due.
    const decided = await this.ledger.decidedKeys(
      PLACE_NAME_LANE,
      PLACE_NAME_RULE_VERSION,
      placeNameLane.keyFoldVersion,
      deduped.map((claim) => placeNameLane.canonicalClaimKey(claim)),
    );
    const undecided = deduped.filter(
      (claim) => !decided.has(placeNameLane.canonicalClaimKey(claim)),
    );
    summary.alreadyDecided = deduped.length - undecided.length;

    // THE BUDGET GATE. Refuses loudly with a quote rather than truncating.
    const authorized = await this.budget.authorizeDrain({
      lane: PLACE_NAME_LANE,
      ruleVersion: PLACE_NAME_RULE_VERSION,
      dueCount: undecided.length,
      approvedHash: options.approvedHash,
    });
    const docket = undecided.slice(0, authorized.allowed);

    for (let i = 0; i < docket.length; i += PLACE_NAME_CLAIMS_PER_CALL) {
      const batch = docket.slice(i, i + PLACE_NAME_CLAIMS_PER_CALL);
      const prepared: PreparedCase[] = [];
      for (const claim of batch) {
        const evidence = await this.evidenceCard(claim);
        if (!evidence) {
          summary.noSuchPlace += 1;
          continue;
        }
        prepared.push(evidence);
      }
      if (!prepared.length) continue;

      let verdicts: Map<number, { isName: boolean; reason: string }>;
      try {
        verdicts = await this.judge(prepared);
      } catch (error) {
        summary.unjudged += prepared.length;
        this.logger.warn(
          'Restaurant-name judge failed (claims left undecided)',
          {
            size: prepared.length,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          },
        );
        continue;
      }

      for (let n = 0; n < prepared.length; n += 1) {
        const p = prepared[n];
        const verdict = verdicts.get(n + 1);
        if (!verdict) {
          // No answer, or an answer with no stated ground — unjudged, still
          // due, offered again next time. Acting on it would mutate the
          // corpus with nothing on the record.
          summary.unjudged += 1;
          continue;
        }
        summary.judged += 1;
        // THE TARGET STATE IS COMPUTED NOW, at decision time, and frozen into
        // the subject — the replay writes what was decided, not a function of
        // a corpus that has since moved (the word lane's idempotence law).
        const effect: PlaceNameEffect = {
          entityId: p.claim.entityId,
          form: p.claim.form,
          takeName: verdict.isName
            ? []
            : p.held.map((row) => ({
                surfaceId: row.surfaceId,
                role: row.role === 'both' ? 'display' : row.role,
                status: row.role === 'both' ? row.status : 'deprecated',
              })),
        };
        if (!dryRun) {
          await this.settle(
            p.claim,
            verdict.isName ? 'isName' : 'notAName',
            verdict.reason,
            effect,
          );
        }
        if (verdict.isName) {
          summary.namesUpheld += 1;
        } else {
          summary.namesDenied += 1;
        }
        summary.cases.push({
          entityId: p.claim.entityId,
          form: p.claim.form,
          placeName: p.placeName,
          outcome: verdict.isName ? 'isName' : 'notAName',
          reason: verdict.reason,
          surfacesTaken: dryRun ? 0 : effect.takeName.length,
        });
      }
    }

    this.logger.info('Restaurant-name hearings complete', {
      ...summary,
      cases: summary.cases.length,
      dryRun,
    });
    return summary;
  }

  /** Commit the verdict, THEN obey it (verdict-then-effect, amendment (c)). */
  private async settle(
    claim: PlaceNameClaim,
    outcome: 'isName' | 'notAName',
    reason: string,
    effect: PlaceNameEffect,
  ): Promise<void> {
    const claimKey = placeNameLane.canonicalClaimKey(claim);
    await this.ledger.record<PlaceNameEffect>({
      lane: PLACE_NAME_LANE,
      claimKey,
      ruleVersion: PLACE_NAME_RULE_VERSION,
      foldVersion: placeNameLane.keyFoldVersion,
      outcome,
      reason,
      ruleFingerprint: PLACE_NAME_RULE_FINGERPRINT,
      subject: effect,
    });
    await this.applyEffect(effect);
    await this.ledger.markExecuted(
      PLACE_NAME_LANE,
      claimKey,
      PLACE_NAME_RULE_VERSION,
      placeNameLane.keyFoldVersion,
    );
  }

  /**
   * THE ONE PLACE THIS LANE'S DECISION TOUCHES THE CORPUS. Live hearings and
   * crash-resume both call this with the SAME stored subject. Overridable so
   * a test can kill the effect mid-hearing and prove the verdict survives.
   *
   * ABSOLUTE, and a NO-OP when the row already says what the verdict ordered:
   * the IS DISTINCT FROM guard is what makes a replay byte-identical rather
   * than merely equivalent.
   */
  protected async applyEffect(effect: PlaceNameEffect): Promise<void> {
    for (const target of effect.takeName) {
      await this.prisma.$executeRaw`
        UPDATE entity_surface
           SET role   = ${target.role},
               status = ${target.status},
               updated_at = now()
         WHERE surface_id = ${target.surfaceId}::uuid
           AND (role, status)
               IS DISTINCT FROM (${target.role}, ${target.status})`;
    }
  }

  /**
   * THE EVIDENCE the judge sees: the entity's grounding state, its other
   * surfaces, its mention footprint, and — decisive for the generic-word
   * cases — RAW NAME-USAGE TEXT from the documents that mention the place.
   *
   * WHY THE RAW TEXT (census specimen check, 2026-08-15): a COUNT cannot
   * separate a real venue whose name IS a generic word (Supper, East
   * Village — "+1 to Supper, best chicken parm I've ever had") from a junk
   * mint (Stars) — both read "one surface, some mentions." Only the running
   * text shows whether people actually CALL the place by the form, so the
   * card quotes up to SNIPPETS_PER_CARD windowed excerpts around the form,
   * one per document, and states the total document count honestly.
   *
   * THE TWO COUNTS ARE DIFFERENT FACTS AND ARE LABELED AS SUCH: "restaurant
   * mention events" (core_restaurant_events + core_restaurant_entity_events,
   * what the census counts) versus "dish mentions via dish connections"
   * (core_restaurant_item_mentions). The pre-fix card printed ONLY the
   * second as "mention footprint", so Supper — 91 events across 11
   * documents — read as zero-mention junk.
   *
   * THE FORM UNDER JUDGMENT IS NEVER ITS OWN EVIDENCE: the surface row being
   * judged is excluded from the "also known as" sample, or every hearing
   * would read the claim restated as proof of itself. The excerpts are not
   * that restatement — they are the CORPUS using the form, which is exactly
   * the provenance question the rule asks.
   */
  private async evidenceCard(
    claim: PlaceNameClaim,
  ): Promise<PreparedCase | null> {
    const entities = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string }>
    >`SELECT entity_id::text, name FROM core_entities
       WHERE entity_id = ${claim.entityId}::uuid
         AND type = 'place' AND status = 'active'`;
    const entity = entities[0];
    if (!entity) return null;

    const [locations, dishMentions, traffic, mentionDocs, surfaces] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ locations: bigint; grounded: bigint; geocoded: bigint }>
        >`SELECT count(*) AS locations,
               count(google_place_id) AS grounded,
               count(latitude) AS geocoded
          FROM core_restaurant_locations
         WHERE restaurant_id = ${claim.entityId}::uuid`,
        this.prisma.$queryRaw<Array<{ mentions: bigint }>>`
        SELECT count(*) AS mentions
          FROM core_restaurant_item_mentions m
          JOIN core_restaurant_items c ON c.connection_id = m.connection_id
         WHERE c.restaurant_id = ${claim.entityId}::uuid`,
        // The census's count: every extraction event naming this restaurant,
        // in BOTH event dimensions, and the distinct documents behind them.
        this.prisma.$queryRaw<Array<{ events: bigint; documents: bigint }>>`
        SELECT (SELECT count(*) FROM core_restaurant_events
                 WHERE restaurant_id = ${claim.entityId}::uuid)
             + (SELECT count(*) FROM core_restaurant_entity_events
                 WHERE restaurant_id = ${claim.entityId}::uuid) AS events,
               (SELECT count(*) FROM (
                  SELECT source_document_id FROM core_restaurant_events
                   WHERE restaurant_id = ${claim.entityId}::uuid
                  UNION
                  SELECT source_document_id FROM core_restaurant_entity_events
                   WHERE restaurant_id = ${claim.entityId}::uuid) u
               ) AS documents`,
        // The raw text those events came from — newest first, bounded.
        this.prisma.$queryRaw<
          Array<{
            document_id: string;
            title: string | null;
            body: string | null;
          }>
        >`SELECT d.document_id::text, d.title, d.body
          FROM collection_source_documents d
         WHERE d.document_id IN (
                SELECT source_document_id FROM core_restaurant_events
                 WHERE restaurant_id = ${claim.entityId}::uuid
                UNION
                SELECT source_document_id FROM core_restaurant_entity_events
                 WHERE restaurant_id = ${claim.entityId}::uuid)
         ORDER BY d.source_created_at DESC
         LIMIT ${PlaceNameHearingService.SNIPPET_DOCS_SCANNED}`,
        this.prisma.$queryRaw<Array<{ form: string }>>`
        SELECT form FROM entity_surface
         WHERE entity_id = ${claim.entityId}::uuid AND status = 'active'
         ORDER BY created_at ASC LIMIT 8`,
      ]);
    const loc = locations[0];
    const underJudgment = surfaceClaimKey(claim.form);
    const otherSurfaces = surfaces
      .map((row) => row.form)
      .filter((form) => surfaceClaimKey(form) !== underJudgment)
      .slice(0, 5);

    const grounded = Number(loc?.grounded ?? 0);
    const groundingLine =
      grounded > 0
        ? `verified against ${grounded} real-world business listing(s) (${Number(loc?.geocoded ?? 0)} geocoded)`
        : Number(loc?.locations ?? 0) > 0
          ? `${Number(loc?.locations ?? 0)} location record(s), NONE verified against a real-world listing`
          : 'no location records at all';

    const events = Number(traffic[0]?.events ?? 0);
    const documents = Number(traffic[0]?.documents ?? 0);
    const snippets = this.nameUsageSnippets(claim.form, mentionDocs);
    const usageLines = snippets.length
      ? [
          `   name usage in source text (${documents} document(s) total; up to ${PlaceNameHearingService.SNIPPETS_PER_CARD} excerpts, one per document):`,
          ...snippets.map((s) => `     - "${s}"`),
        ]
      : [
          `   name usage in source text: no occurrence of the form found in the ${Math.min(documents, PlaceNameHearingService.SNIPPET_DOCS_SCANNED)} most recent of ${documents} document(s)`,
        ];

    const card = [
      `restaurant: "${entity.name}"`,
      `   grounding: ${groundingLine}`,
      `   other surfaces: ${otherSurfaces.length ? otherSurfaces.join(', ') : '(none — this form is the entity’s only identity)'}`,
      `   mention traffic: ${events} restaurant mention event(s) across ${documents} source document(s); ${Number(dishMentions[0]?.mentions ?? 0)} dish mention(s) attributed via dish connections`,
      ...usageLines,
    ].join('\n');

    return {
      claim,
      placeName: entity.name,
      card,
      held: await this.heldRecallRows(claim),
    };
  }

  /** Live recall rows this exact form (accents included) holds on the entity,
   *  across every locale — what a `notAName` verdict takes. The fold FETCHES
   *  the candidate rows (it is the indexed column); the claim key DECIDES. */
  private async heldRecallRows(
    claim: PlaceNameClaim,
  ): Promise<Array<{ surfaceId: string; role: string; status: string }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ surface_id: string; form: string; role: string; status: string }>
    >`SELECT surface_id::text, form, role::text, status::text
        FROM entity_surface
       WHERE entity_id = ${claim.entityId}::uuid
         AND form_folded = ${canonicalFold(claim.form)}
         AND status = 'active'
         AND role <> 'display'`;
    const key = surfaceClaimKey(claim.form);
    return rows
      .filter((row) => surfaceClaimKey(row.form) === key)
      .map((row) => ({
        surfaceId: row.surface_id,
        role: row.role,
        status: row.status,
      }));
  }

  /**
   * WINDOWED EXCERPTS of the form in the entity's own mention documents —
   * one per document, up to SNIPPETS_PER_CARD. Matching is case- and
   * accent-insensitive (a per-character fold with an index map back into the
   * ORIGINAL text, so the quoted window is the real bytes people wrote, not
   * a folded rendering), and bounded by word edges so "supper" never matches
   * inside "suppertime's" neighbors silently — an occurrence is the form
   * used as a word.
   */
  private nameUsageSnippets(
    form: string,
    docs: Array<{
      document_id: string;
      title: string | null;
      body: string | null;
    }>,
  ): string[] {
    const foldChar = (ch: string): string =>
      // Apostrophes fold to NOTHING, same as surfaceClaimKey's treatment:
      // the census hands us the folded form ("ninos"), and the raw text says
      // "Nino's" \u2014 a possessive coinage IS the name (B.1 doctrine). Without
      // this, every possessive-named venue's usage is invisible to the card
      // and the judge reads "no usage found" (the ninos re-hear, 2026-08-16).
      /['\u2019\u02bc]/.test(ch)
        ? ''
        : ch
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    const needle = Array.from(form).map(foldChar).join('');
    if (!needle) return [];
    const isWordChar = (ch: string | undefined): boolean =>
      ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

    const snippets: string[] = [];
    for (const doc of docs) {
      if (snippets.length >= PlaceNameHearingService.SNIPPETS_PER_CARD) break;
      const text = [doc.title, doc.body].filter(Boolean).join('\n');
      if (!text) continue;
      // Folded haystack with a map back to original character indices.
      const chars = Array.from(text);
      let folded = '';
      const originIndex: number[] = [];
      for (let i = 0; i < chars.length; i += 1) {
        const f = foldChar(chars[i]);
        for (let k = 0; k < f.length; k += 1) originIndex.push(i);
        folded += f;
      }
      let at = folded.indexOf(needle);
      while (at >= 0) {
        const beforeIdx = originIndex[at] - 1;
        const afterOrigin = originIndex[at + needle.length - 1] + 1;
        const boundedLeft = !isWordChar(chars[beforeIdx]);
        const boundedRight = !isWordChar(chars[afterOrigin]);
        if (boundedLeft && boundedRight) {
          const start = Math.max(
            0,
            originIndex[at] - PlaceNameHearingService.SNIPPET_WINDOW,
          );
          const end = Math.min(
            chars.length,
            afterOrigin + PlaceNameHearingService.SNIPPET_WINDOW,
          );
          const window = chars
            .slice(start, end)
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
          snippets.push(
            `${start > 0 ? '…' : ''}${window}${end < chars.length ? '…' : ''}`,
          );
          break; // one snippet per document
        }
        at = folded.indexOf(needle, at + 1);
      }
    }
    return snippets;
  }

  private async judge(
    items: PreparedCase[],
  ): Promise<Map<number, { isName: boolean; reason: string }>> {
    // THE RULE lives in prompts/restaurant-name-judge-prompt.md; only the
    // dynamic case cards are built here.
    const prompt = items
      .map(
        (item, index) =>
          `${index + 1}. FORM "${item.claim.form}" claimed as a name of:\n   ${item.card}`,
      )
      .join('\n');

    const text = await this.llm.generateForCaller({
      caller: 'aliases.place_name_judge',
      systemInstruction: PLACE_NAME_JUDGE_PROMPT,
      prompt,
      generationConfig: {
        // Zero: name verdicts are persisted rulings; a re-ask must return the
        // same answer (same measured rationale as the word-ownership judge).
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  n: { type: 'number' },
                  is_name: { type: 'boolean' },
                  reason: {
                    type: 'string',
                    description:
                      'The stated ground for the ruling, citing the evidence that decided it — a blank reason leaves the case unjudged',
                  },
                },
                required: ['n', 'is_name', 'reason'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{ n?: number; is_name?: boolean; reason?: string }>;
    };
    return new Map(
      (parsed.items ?? [])
        .filter((item) => typeof item.n === 'number')
        // A RULING WITH NO STATED GROUND IS NOT A RULING (amendment (d)).
        .filter((item) => (item.reason ?? '').trim().length > 0)
        .map((item) => [
          item.n as number,
          {
            isName: item.is_name === true,
            reason: (item.reason ?? '').trim(),
          },
        ]),
    );
  }
}
