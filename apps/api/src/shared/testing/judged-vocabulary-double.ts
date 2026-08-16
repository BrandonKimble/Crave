import { JudgedVocabularyService } from '../../modules/content-processing/entity-resolver/judged-vocabulary.service';
import {
  GRAMMATICAL_WORK,
  NEGATES,
  ROLE_FRAME,
  ROLE_PARTICULAR,
  ROLE_VENUE_CATEGORY,
  WORD_GENERICNESS_LANE,
  WORD_NEGATION_LANE,
  WORD_ROLE_LANE,
  normalizeClaimLocale,
} from '../../modules/content-processing/entity-resolver/word-vocabulary-lanes';
import { surfaceClaimKey } from '../../modules/content-processing/entity-resolver/entity-surface.service';

/**
 * A JUDGED VOCABULARY WITH A KNOWN MIND — the test double for every suite that
 * constructs a search or collector service directly.
 *
 * It is the REAL class with its table pre-filled and its judge disconnected,
 * not a hand-rolled shape: a stub that merely satisfied the constructor would
 * let the strip logic drift away from what the specs believe it does, which is
 * exactly how a locale-keyed list ended up being read as an English one.
 *
 * Seed it with the verdicts a test depends on. Everything else reads as
 * CERTIFIED-BUT-ORDINARY — heard, and carrying a concept — because that is
 * what a running system looks like once the bulk certification is paid for.
 * The unheard-word path is opted into with `unjudged`, so a suite about
 * keyword selection is not silently a suite about a cold cache.
 */
export function judgedVocabularyDouble(
  seed: {
    grammatical?: Array<[word: string, locale: string]>;
    negators?: Array<[word: string, locale: string]>;
    /** Word-role verdicts. Unlisted words read as PARTICULAR by default —
     *  the certified-but-ordinary state — via a seeded fallback below. */
    frames?: Array<[word: string, locale: string]>;
    venueCategories?: Array<[word: string, locale: string]>;
    /** Words this vocabulary has NOT heard — the hold path. Everything else
     *  counts as certified, which is what a running system looks like once
     *  the bulk certification has been paid for. A double that defaulted to
     *  "nothing is judged" would make every unrelated suite exercise the
     *  hold branch and assert nothing about its own subject. */
    unjudged?: string[];
  } = {},
): JudgedVocabularyService {
  const service = Object.create(
    JudgedVocabularyService.prototype,
  ) as JudgedVocabularyService;
  const internals = service as unknown as {
    verdicts: Map<string, Map<string, string>>;
    negatingForms: Set<string>;
    pending: Map<string, unknown>;
    loaded: boolean;
    logger: { info: () => void; warn: () => void };
    judge: {
      certify: (lane: string, claims: unknown[]) => Promise<unknown>;
      certifyFacets: (
        lanes: readonly string[],
        claims: unknown[],
      ) => Promise<unknown>;
    };
  };
  internals.verdicts = new Map([
    [WORD_GENERICNESS_LANE, new Map<string, string>()],
    [WORD_NEGATION_LANE, new Map<string, string>()],
    [WORD_ROLE_LANE, new Map<string, string>()],
  ]);
  internals.negatingForms = new Set();
  internals.pending = new Map();
  internals.loaded = true;
  internals.logger = { info: () => undefined, warn: () => undefined };
  // A DOUBLE NEVER BUYS A HEARING. The door still runs — it computes which
  // words are unheard and calls through — but the judge answers nothing, so a
  // suite that depends on an unseeded word sees the UNJUDGED behaviour, which
  // is the state production must survive too. `heard` is the record, so a spec
  // can assert the door was actually consulted.
  const heard: Array<{ lane: string; words: string[] }> = [];
  const summaryFor = (lane: string, claims: unknown[]) => ({
    lane,
    considered: claims.length,
    alreadyDecided: 0,
    judged: 0,
    unjudged: claims.length,
    failedBatches: 0,
    outcomes: {},
  });
  internals.judge = {
    certify: (lane, claims) => {
      heard.push({
        lane,
        words: (claims as Array<{ word: string }>).map((c) => c.word),
      });
      return Promise.resolve(summaryFor(lane, claims));
    },
    // CO-DUE (B-call): the door now asks every due facet in ONE call, so the
    // double records one entry per facet — `heard` keeps meaning "the door was
    // consulted about these words on this lane".
    certifyFacets: (lanes, claims) => {
      const words = (claims as Array<{ word: string }>).map((c) => c.word);
      for (const lane of lanes) heard.push({ lane, words });
      return Promise.resolve(
        new Map(lanes.map((lane) => [lane, summaryFor(lane, claims)])),
      );
    },
  };
  (service as unknown as { heard: typeof heard }).heard = heard;

  for (const [word, locale] of seed.grammatical ?? []) {
    internals.verdicts
      .get(WORD_GENERICNESS_LANE)!
      .set(
        `${normalizeClaimLocale(locale)}|${surfaceClaimKey(word)}`,
        GRAMMATICAL_WORK,
      );
  }
  for (const [word] of seed.negators ?? []) {
    // SPELLING ALONE (B-key, 2026-08-15): this lane's claim key carries no
    // locale, so the fixture's locale column is population, not identity —
    // it says which language the seed came FROM, never which one the verdict
    // answers for.
    internals.verdicts
      .get(WORD_NEGATION_LANE)!
      .set(`und|${surfaceClaimKey(word)}`, NEGATES);
    internals.negatingForms.add(surfaceClaimKey(word));
  }
  // Seeded under the stated locale AND 'und' — mirroring the certification,
  // which buys both keys for every word (most real asks arrive undetectable).
  for (const [word, locale] of seed.frames ?? []) {
    for (const tag of [normalizeClaimLocale(locale), 'und']) {
      internals.verdicts
        .get(WORD_ROLE_LANE)!
        .set(`${tag}|${surfaceClaimKey(word)}`, ROLE_FRAME);
    }
  }
  for (const [word, locale] of seed.venueCategories ?? []) {
    for (const tag of [normalizeClaimLocale(locale), 'und']) {
      internals.verdicts
        .get(WORD_ROLE_LANE)!
        .set(`${tag}|${surfaceClaimKey(word)}`, ROLE_VENUE_CATEGORY);
    }
  }
  // Word-role reads as CERTIFIED-AND-PARTICULAR for every unlisted word —
  // the running-system state — while `unjudged` words stay unheard (null).
  const realRoleOf = JudgedVocabularyService.prototype.roleOf.bind(
    service,
  ) as JudgedVocabularyService['roleOf'];
  service.roleOf = (word: string, locale: string | null | undefined) => {
    const seeded = realRoleOf(word, locale);
    if (seeded) return seeded;
    return (seed.unjudged ?? []).some(
      (w) => surfaceClaimKey(w) === surfaceClaimKey(word),
    )
      ? null
      : ROLE_PARTICULAR;
  };
  // THE VOCABULARY IS CERTIFIED unless the test says otherwise. `heldUnjudged`
  // and `holdsUnjudged` are the door's "I have not heard this word yet" answer;
  // in a running system that is true once per word, ever, and a suite about
  // keyword selection or signal writing is not about that moment.
  const unjudged = new Set((seed.unjudged ?? []).map(surfaceClaimKey));
  const isUnjudged = (text: string): boolean =>
    (text.match(/[\p{L}\p{N}]+/gu) ?? []).some((word) =>
      unjudged.has(surfaceClaimKey(word)),
    );
  service.holdsUnjudged = (text: string) => isUnjudged(text);
  const realStrip = JudgedVocabularyService.prototype.judgeThenStrip.bind(
    service,
  ) as JudgedVocabularyService['judgeThenStrip'];
  service.judgeThenStrip = async (
    text: string,
    locale: string | null | undefined,
  ) => ({
    ...(await realStrip(text, locale)),
    heldUnjudged: isUnjudged(text),
  });
  return service;
}

/** The launch-locale negators, as the hand lists used to hold them — the
 *  fixture every parity spec compares against. */
export const LEGACY_CUE_SEED: Array<[string, string]> = [
  ['no', 'en'],
  ['without', 'en'],
  ['not', 'en'],
  ['non', 'en'],
  ['sin', 'es'],
  ['no', 'es'],
  ['senza', 'it'],
  ['non', 'it'],
  ['ohne', 'de'],
  ['kein', 'de'],
  ['keine', 'de'],
  ['nicht', 'de'],
  ['sans', 'fr'],
  ['pas', 'fr'],
  ['sem', 'pt'],
  ['không', 'vi'],
  ['chẳng', 'vi'],
  ['đừng', 'vi'],
  ['miễn', 'vi'],
];
