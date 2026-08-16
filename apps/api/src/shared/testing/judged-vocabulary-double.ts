import { JudgedVocabularyService } from '../../modules/content-processing/entity-resolver/judged-vocabulary.service';
import {
  GRAMMATICAL_WORK,
  NEGATES,
  WORD_GENERICNESS_LANE,
  WORD_NEGATION_LANE,
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
    judge: { certify: (lane: string, claims: unknown[]) => Promise<unknown> };
  };
  internals.verdicts = new Map([
    [WORD_GENERICNESS_LANE, new Map<string, string>()],
    [WORD_NEGATION_LANE, new Map<string, string>()],
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
  internals.judge = {
    certify: (lane, claims) => {
      heard.push({
        lane,
        words: (claims as Array<{ word: string }>).map((c) => c.word),
      });
      return Promise.resolve({
        lane,
        considered: claims.length,
        alreadyDecided: 0,
        judged: 0,
        unjudged: claims.length,
        outcomes: {},
      });
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
  for (const [word, locale] of seed.negators ?? []) {
    internals.verdicts
      .get(WORD_NEGATION_LANE)!
      .set(`${normalizeClaimLocale(locale)}|${surfaceClaimKey(word)}`, NEGATES);
    internals.negatingForms.add(surfaceClaimKey(word));
  }
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
