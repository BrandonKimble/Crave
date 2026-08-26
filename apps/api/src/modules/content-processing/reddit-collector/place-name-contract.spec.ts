import {
  canonicalizeObservedPlaceName,
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

  it('refuses empty spans and empty sources', () => {
    expect(observedSpanAppearsInSource('', text)).toBe(false);
    expect(observedSpanAppearsInSource('lucali', '')).toBe(false);
  });
});
