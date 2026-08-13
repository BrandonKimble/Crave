/**
 * GENERIC-TOKEN STRIPPING IS LOCALE-KEYED.
 *
 * The module held one English list and applied it to every string regardless
 * of language. Under-stripping a Spanish query is cosmetic; OVER-stripping is
 * not. `isGenericOnly` makes callers DISCARD the term — the keyword lane drops
 * it from the cycle, the on-demand lane sanitizes it to '' — so an English
 * word list could throw away a non-English ask outright.
 *
 * The rule pinned here: we strip only for a language whose generic vocabulary
 * we actually hold. Today that is English alone. `und`/absent means the
 * untagged English-by-construction corpus, so every pre-existing caller keeps
 * its exact behaviour.
 */
import { stripGenericTokens } from './generic-token-handling';

describe('stripGenericTokens — locale-keyed genericness', () => {
  describe('English', () => {
    it.each(['en', 'en-US'])(
      'strips rank/location modifiers for locale %s',
      (locale) => {
        expect(stripGenericTokens('best tacos', locale).text).toBe('tacos');
      },
    );
  });

  describe('an UNDETERMINED language gets NO vocabulary — not English', () => {
    // Corrected 2026-08-13. These three inputs used to resolve to the English
    // list on the reading that "the untagged corpus is English by
    // construction". That reading is retired everywhere else already
    // (localeLookupChain, entity_surface.locale): 'und' means UNIVERSAL — the
    // honest tag for a string nobody could assign a language to — and a
    // universal tag entitles a term to NO language's stop list. "We could not
    // tell what language this was" is not evidence that it was English.
    it.each([undefined, null, 'und'])(
      'leaves the string whole for locale %s',
      (locale) => {
        expect(stripGenericTokens('best tacos', locale).text).toBe(
          'best tacos',
        );
      },
    );

    it('never returns the generic-only verdict for an undetermined term', () => {
      // THE DESTRUCTIVE DIRECTION, and the reason this matters. isGenericOnly
      // makes callers DISCARD the term outright — the keyword lane drops it,
      // the on-demand lane sanitizes it to ''. A Vietnamese one-worder whose
      // language the detector cannot decide arrives here as null; under the
      // old default it was prosecuted under English law and deleted.
      expect(stripGenericTokens('best restaurants', null).isGenericOnly).toBe(
        false,
      );
      expect(stripGenericTokens('top', null).isGenericOnly).toBe(false);
    });
  });

  describe('English, continued', () => {
    it('judges an all-generic English string generic-only', () => {
      // Rank modifier + generic object and nothing else: there is no dish here
      // to go collect, so the caller is told to discard it.
      expect(stripGenericTokens('best restaurants', 'en').isGenericOnly).toBe(
        true,
      );
      expect(stripGenericTokens('best places', 'en').isGenericOnly).toBe(true);
    });

    it('pins what the English vocabulary does NOT hold: bare pronouns', () => {
      // 'near' is stripped as a location modifier but 'me' is not in either
      // English list, so it survives as a token and the string escapes the
      // generic-only verdict. This is the harmless (under-stripping)
      // direction — a slightly worse outbound query, never a deleted ask —
      // and it is pre-existing behaviour that locale-keying did not change.
      // Pinned so that widening the English list is a deliberate, visible act
      // rather than a silent side effect of some other change.
      expect(stripGenericTokens('best restaurants near me', 'en')).toEqual({
        text: 'restaurants me',
        isGenericOnly: false,
      });
    });
  });

  describe('a language whose generic vocabulary we do NOT hold', () => {
    it('strips nothing from Spanish', () => {
      // 'mejores' is not removed — we have no authored Spanish generic list,
      // and inventing one is the fabrication this design refuses.
      expect(stripGenericTokens('mejores tacos', 'es').text).toBe(
        'mejores tacos',
      );
    });

    it('never applies ENGLISH generic words to a non-English ask', () => {
      // The destructive direction. Under the old single-list behaviour these
      // English tokens were stripped out of any string, in any language.
      expect(stripGenericTokens('top', 'vi').text).toBe('top');
      expect(stripGenericTokens('top', 'vi').isGenericOnly).toBe(false);
      expect(stripGenericTokens('close', 'es').isGenericOnly).toBe(false);
    });

    it('preserves diacritics and never judges a Vietnamese ask generic-only', () => {
      const result = stripGenericTokens('bún đậu mắm tôm', 'vi');
      expect(result.text).toBe('bún đậu mắm tôm');
      expect(result.isGenericOnly).toBe(false);
    });

    it('still reports empty input as generic-only', () => {
      expect(stripGenericTokens('   ', 'vi')).toEqual({
        text: '',
        isGenericOnly: true,
      });
    });
  });

  it('resolves the vocabulary through the locale CHAIN, not exact match', () => {
    // 'en-GB' reaches the English entry the same way every other
    // locale-scoped read in the codebase resolves a locale.
    expect(stripGenericTokens('best tacos', 'en-GB').text).toBe('tacos');
    // 'es-MX' walks es-mx -> es-419 -> es -> und and finds no entry.
    expect(stripGenericTokens('mejores tacos', 'es-MX').text).toBe(
      'mejores tacos',
    );
  });
});
