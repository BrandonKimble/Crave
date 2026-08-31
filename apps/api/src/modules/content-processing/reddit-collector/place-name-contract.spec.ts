import {
  canonicalizeObservedPlaceName,
  ingredientSpanAppearsInSource,
  normalizeSpanMechanically,
  observedSpanAppearsInSource,
} from './place-name-contract';

describe('canonicalizeObservedPlaceName', () => {
  it('is byte-identical for ordinary names', () => {
    expect(canonicalizeObservedPlaceName("joe's pizza")).toBe("joe's pizza");
    expect(canonicalizeObservedPlaceName('pho & co.')).toBe('pho & co.');
    expect(canonicalizeObservedPlaceName('phở lệ')).toBe('phở lệ');
  });

  it('applies the mechanical normalization (lowercase, whitespace collapse)', () => {
    expect(canonicalizeObservedPlaceName("  Joe's   Pizza ")).toBe(
      "joe's pizza",
    );
  });

  it('drops a trailing location token behind a longer brand (old B.3)', () => {
    expect(canonicalizeObservedPlaceName('momoya soho')).toBe('momoya');
    expect(canonicalizeObservedPlaceName("katz's les")).toBe("katz's");
    expect(canonicalizeObservedPlaceName('shake shack midtown')).toBe(
      'shake shack',
    );
    expect(canonicalizeObservedPlaceName('birria-landia queens')).toBe(
      'birria-landia',
    );
    expect(canonicalizeObservedPlaceName('cocoron chelsea')).toBe('cocoron');
  });

  it('never drops a leading or lone location token', () => {
    // "queens" alone or fronting a brand is the name, not a branch tail.
    expect(canonicalizeObservedPlaceName('queens')).toBe('queens');
    expect(canonicalizeObservedPlaceName('queens bakery')).toBe(
      'queens bakery',
    );
    expect(canonicalizeObservedPlaceName('soho house')).toBe('soho house');
  });

  it('peels stacked trailing tokens but always leaves a brand', () => {
    expect(canonicalizeObservedPlaceName('lucali brooklyn')).toBe('lucali');
    expect(canonicalizeObservedPlaceName('midtown queens')).toBe('midtown');
  });

  it('keeps diacritics and punctuation exactly as observed', () => {
    expect(canonicalizeObservedPlaceName('café crème')).toBe('café crème');
    expect(canonicalizeObservedPlaceName('los tacos no.1')).toBe(
      'los tacos no.1',
    );
  });
});

describe('normalizeSpanMechanically', () => {
  it('folds curly apostrophes to straight and collapses whitespace', () => {
    expect(normalizeSpanMechanically('Adrienne’s  Pizzabar')).toBe(
      "adrienne's pizzabar",
    );
  });

  it('applies NFC so composed and decomposed accents compare equal', () => {
    expect(normalizeSpanMechanically('café')).toBe(
      normalizeSpanMechanically('café'),
    );
  });
});

describe('observedSpanAppearsInSource', () => {
  const text =
    'Went to Adrienne’s in FiDi last week — Joe’s Pizza is still my go-to, and Lucali was packed.';

  it('finds a span across case, curly quotes, and whitespace', () => {
    expect(observedSpanAppearsInSource("adrienne's", text)).toBe(true);
    expect(observedSpanAppearsInSource("joe's pizza", text)).toBe(true);
    expect(observedSpanAppearsInSource('lucali', text)).toBe(true);
  });

  it('refuses a name the source never wrote', () => {
    expect(observedSpanAppearsInSource("lefty's pizza", text)).toBe(false);
    expect(observedSpanAppearsInSource('franklin bbq', text)).toBe(false);
  });

  it('licenses possessive-clitic variance in both directions', () => {
    // Emitted form lacks the 's the text has (B.3 strips the attaching clitic).
    expect(
      observedSpanAppearsInSource('nixta', "Nixta's duck carnitas are great"),
    ).toBe(true);
    // Emitted form carries 's; text has the bare form + sentence apostrophe drift.
    expect(observedSpanAppearsInSource("lucali's", 'Lucali was packed')).toBe(
      true,
    );
    // Trailing bare apostrophe drift.
    expect(observedSpanAppearsInSource("guys'", 'five guys is overrated')).toBe(
      true,
    );
  });

  it('does not treat possessive variance as a license for other edits', () => {
    expect(
      observedSpanAppearsInSource('nixta cocina', "Nixta's duck carnitas"),
    ).toBe(false);
  });

  it('anchors at word boundaries: a substring of a different word is refused', () => {
    // redteam-l1 F2: fabricated short names must not verify inside longer words.
    expect(observedSpanAppearsInSource('oro', 'Loro was fantastic')).toBe(
      false,
    );
    expect(observedSpanAppearsInSource('ho ho', 'Tho Ho House rules')).toBe(
      false,
    );
    expect(observedSpanAppearsInSource("torchy's", 'torchyland opened')).toBe(
      false,
    );
  });

  it('still admits legitimate whole-word occurrences and possessive drift', () => {
    expect(observedSpanAppearsInSource('oro', 'Oro was fantastic')).toBe(true);
    // Emitted possessive vs a no-apostrophe spelling in the text.
    expect(observedSpanAppearsInSource("lefty's", 'Leftys is great')).toBe(
      true,
    );
    // Plain span immediately before a possessive clitic in the text.
    expect(
      observedSpanAppearsInSource('torchy', "Torchy's queso is elite"),
    ).toBe(true);
    // CHANGED 2026-08-31 (atom run): this direction is now ACCEPTED. It used
    // to be pinned false as "dangerous", but the banked v18 refusals are full
    // of exactly it — `torchys` for "Torchy's", `jack allens` for "Jack
    // Allen's", `curras oltorf` for "Curra's Oltorf", `maudies`, `lil
    // darlins`. It is the model dropping an apostrophe, not inventing a name,
    // and the repo's own identity law already rules that "Phil's" and "Phils"
    // are ONE name (canonicalFold deletes apostrophes outright).
    expect(observedSpanAppearsInSource('leftys', "Lefty's is great")).toBe(
      true,
    );
  });

  it('refuses empty spans and empty sources', () => {
    expect(observedSpanAppearsInSource('', text)).toBe(false);
    expect(observedSpanAppearsInSource('lucali', '')).toBe(false);
  });
});

describe('ingredientSpanAppearsInSource (junk RC2)', () => {
  it('admits an ingredient the source wrote, verbatim', () => {
    expect(
      ingredientSpanAppearsInSource('gruyere', ['the gruyere popover slaps']),
    ).toBe(true);
  });

  it("licenses C.5's singular mandate against a plural source (head token)", () => {
    expect(
      ingredientSpanAppearsInSource('chanterelle', [
        'pasta with burrata, chanterelles, and pesto',
      ]),
    ).toBe(true);
    expect(
      ingredientSpanAppearsInSource('berry', ['loaded with fresh berries']),
    ).toBe(true);
    expect(ingredientSpanAppearsInSource('peach', ['peaches on top'])).toBe(
      true,
    );
  });

  it('licenses the reverse direction (emitted plural, source singular)', () => {
    expect(
      ingredientSpanAppearsInSource('noodles', ['an extra side of noodle']),
    ).toBe(true);
  });

  it('inflects only the HEAD token of a multi-word ingredient', () => {
    expect(
      ingredientSpanAppearsInSource('black bean', [
        'tacos with black beans and rice',
      ]),
    ).toBe(true);
  });

  it('refuses pantry canonicalization: substitution, expansion, translation', () => {
    // The RC2 walk, pinned: same-concept substitution.
    expect(
      ingredientSpanAppearsInSource('salted crab', ['the fermented crab one']),
    ).toBe(false);
    // Peeled word re-expanded to the pantry-noun form.
    expect(
      ingredientSpanAppearsInSource('tea leaf', [
        'peach tea glazed pork belly',
      ]),
    ).toBe(false);
    // Nickname expansion.
    expect(
      ingredientSpanAppearsInSource('earl grey tea', ['get the dirty earl']),
    ).toBe(false);
    // Translation of a dish name into contents.
    expect(
      ingredientSpanAppearsInSource('wine', ['the coq au vin is perfect']),
    ).toBe(false);
    // Synthesized head noun ("sauce") beyond the source's words.
    expect(
      ingredientSpanAppearsInSource('rojas adobadas sauce', [
        'Enchiladas rojas adobadas',
      ]),
    ).toBe(false);
    // Completed compound ("seed" inserted).
    expect(
      ingredientSpanAppearsInSource('sesame seed bun', [
        'loved the sesame bun',
      ]),
    ).toBe(false);
  });

  it('anchors at word boundaries and matches across the source union', () => {
    expect(ingredientSpanAppearsInSource('oro', ['chicharron de loro'])).toBe(
      false,
    );
    expect(
      ingredientSpanAppearsInSource('pesto', [
        'no mention here',
        'their pesto is unreal',
      ]),
    ).toBe(true);
  });

  it('refuses empty spans and empty sources', () => {
    expect(ingredientSpanAppearsInSource('', ['text'])).toBe(false);
    expect(ingredientSpanAppearsInSource('pesto', ['', ''])).toBe(false);
    expect(ingredientSpanAppearsInSource('pesto', [])).toBe(false);
  });

  it('folds diacritics both ways, composing with number variance (v17 loop3)', () => {
    // The bench's failing pair: plural AND accent differ together.
    expect(
      ingredientSpanAppearsInSource('jalapeno', ['loaded with jalapeños']),
    ).toBe(true);
    // The reverse direction: emitted accent, source plain.
    expect(
      ingredientSpanAppearsInSource('jalapeño', ['extra jalapenos please']),
    ).toBe(true);
    // Fold alone, no number variance.
    expect(ingredientSpanAppearsInSource('pate', ['the pâté was silky'])).toBe(
      true,
    );
    // Folding is not a license for other edits.
    expect(
      ingredientSpanAppearsInSource('jalapeno', ['loaded with habaneros']),
    ).toBe(false);
  });

  it('accepts a bound-morpheme compound (v17 mechanical)', () => {
    expect(
      ingredientSpanAppearsInSource('cheese', ['best cheeseburger in town']),
    ).toBe(true);
    expect(
      ingredientSpanAppearsInSource('burger', ['best cheeseburger in town']),
    ).toBe(true);
    // Composes with number variance on the containing word.
    expect(
      ingredientSpanAppearsInSource('cheese', ['their cheeseburgers rule']),
    ).toBe(true);
    // Not a raw-substring license: the remainder must be a plausible
    // morpheme, so short-remainder embeddings still refuse.
    expect(ingredientSpanAppearsInSource('rice', ['worth the price'])).toBe(
      false,
    );
    expect(ingredientSpanAppearsInSource('oro', ['chicharron de loro'])).toBe(
      false,
    );
    // Multi-word ingredients never morpheme-match.
    expect(
      ingredientSpanAppearsInSource('salted crab', ['saltedcrabapple thing']),
    ).toBe(false);
  });

  it('folds hyphen-vs-space drift both ways (v17 mechanical)', () => {
    expect(
      ingredientSpanAppearsInSource('chili garlic', [
        'the chili-garlic crisp is addictive',
      ]),
    ).toBe(true);
    expect(
      ingredientSpanAppearsInSource('chili-garlic', ['their chili garlic oil']),
    ).toBe(true);
  });
});

/**
 * THE ATOM RUN (2026-08-31). Every ACCEPT below is a span the v18 shadow
 * re-extraction actually banked as `span_not_in_cited_source`, replayed
 * against its real source text pulled from staging; every REFUSE is either a
 * banked refusal that is genuinely unsupported by its source, or the
 * structural hallucination the rule must never let through. This block FAILS
 * against the pre-change checker: it had no atom-run path at all, so all
 * eleven accepts returned false.
 */
describe('observedSpanAppearsInSource — atom run (real banked refusals)', () => {
  it('accepts a name recovered from a domain', () => {
    expect(
      observedSpanAppearsInSource(
        'fuego latino gastropub',
        'try fuegolatinogastropub.com for the best pupusas',
      ),
    ).toBe(true);
    expect(
      observedSpanAppearsInSource(
        'el borrego negro',
        'https://www.instagram.com/elborregonegro_cocinadehumo/?hl=en',
      ),
    ).toBe(true);
  });

  it('accepts a name recovered from a social handle', () => {
    expect(
      observedSpanAppearsInSource('gangnam krn bbq', '3. @gangnamkrnbbq - the'),
    ).toBe(true);
    expect(
      observedSpanAppearsInSource(
        'guatemalteca authentic food',
        '7. @guatemalteca_authentic_food - pepian',
      ),
    ).toBe(true);
    expect(
      observedSpanAppearsInSource(
        'el paso flauta',
        '5. @elpasoflauta - Located in Menchaca',
      ),
    ).toBe(true);
  });

  it('accepts punctuation and accent drift between span and source', () => {
    // U+2011 non-breaking hyphen in the source; ASCII hyphens in the span.
    expect(observedSpanAppearsInSource('h-e-b', 'in an H‑E‑B tortilla')).toBe(
      true,
    );
    expect(
      observedSpanAppearsInSource('j&js', "from J&J's up in Cedar Park"),
    ).toBe(true);
    expect(observedSpanAppearsInSource('el nino', 'I prefer El Niño')).toBe(
      true,
    );
  });

  it('accepts possessive and plural drift the old path missed', () => {
    expect(
      observedSpanAppearsInSource(
        'curras oltorf',
        "Queso flameado at Curra's Oltorf",
      ),
    ).toBe(true);
    expect(
      observedSpanAppearsInSource(
        'lil darlins',
        "dates at Lil' Darlins'. Amazing",
      ),
    ).toBe(true);
    expect(
      observedSpanAppearsInSource('sap', 'Saps spring rolls are great'),
    ).toBe(true);
  });

  it('STILL REFUSES what the source does not support', () => {
    // Mid-atom fragment — the hallucination guard, unchanged.
    expect(observedSpanAppearsInSource('oro', 'chicharron de loro')).toBe(
      false,
    );
    // Prefix inside an unsegmentable host: licensing it would license `red`
    // against "reddit.com".
    expect(
      observedSpanAppearsInSource(
        'boteco',
        'socializing here! https://www.botecoatx.com',
      ),
    ).toBe(false);
    // Model truncated the source's word.
    expect(
      observedSpanAppearsInSource(
        'cafe crem',
        'Cafe Nena Cafe Cremé for a chill',
      ),
    ).toBe(false);
    // Model completed the official name from its own knowledge.
    expect(
      observedSpanAppearsInSource(
        'better half coffee & cocktails',
        'between Better Half and Hold Out',
      ),
    ).toBe(false);
    // Source typo the model silently corrected.
    expect(
      observedSpanAppearsInSource(
        'texas chili parlor',
        "Kerbey, Magnolia, Chuy's, Texas Chili Parlol lol",
      ),
    ).toBe(false);
    // Nothing at all.
    expect(
      observedSpanAppearsInSource(
        'unknown restaurant',
        'the tacos there are great',
      ),
    ).toBe(false);
    // The handle elided the possessive s INSIDE the run ("tuccissubs" vs the
    // source atom "tuccisubs"). The tail-variance rule only reaches a run's
    // END, so this stays refused — recovering it would need an interior
    // edit, i.e. a distance.
    expect(
      observedSpanAppearsInSource(
        "tucci's subs",
        '10. @tuccisubs - Grandmas hot ham',
      ),
    ).toBe(false);
    // NOT a comparison defect: the corpus stores the body HTML-escaped, so
    // the source's "&" reaches us as the literal atom "amp". Recorded here so
    // the next reader does not mistake it for a fold problem.
    expect(
      observedSpanAppearsInSource(
        'veracruz fonda & bar',
        'Paprika, Veracruz Fonda &amp; Bar, Discada',
      ),
    ).toBe(false);
  });
});
