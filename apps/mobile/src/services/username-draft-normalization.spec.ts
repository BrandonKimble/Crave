/**
 * F5805 discriminator — username normalization has ONE home.
 *
 * The defect: three copies of the server's `raw.trim().toLowerCase().replace(/\s+/g, '')`
 * — the server's own, EditProfilePanel's byte-for-byte restatement, and Onboarding's copy
 * which ALSO stripped '@'. Two of the three had already drifted, and the drift landed on
 * exactly the field that invites the character: EditProfilePanel's placeholder renders
 * `@{currentUsername}`, so typing what the field showed sent the '@' to the server and came
 * back unavailable, while the identical keystrokes during onboarding succeeded.
 *
 * The mobile jest project has no react-test-renderer and no @testing-library, so the two
 * SURFACES cannot be driven here. The second describe below is therefore a source scanner:
 * it is what turns "one home" into a checkable fact rather than a convention. Stated plainly
 * because a scanner is weaker evidence than a behavioural test — it pins the WIRING, and the
 * first describe pins the BEHAVIOUR that wiring delivers.
 *
 * PROVING MUTATION: revert either surface to its own local copy
 * (`value.trim().toLowerCase().replace(/\s+/g, '')`) and the scanner goes RED, naming the file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeUsernameDraft } from './username-draft';

const SRC_ROOT = join(__dirname, '..');

/** Every surface that turns a typed draft into the string sent to the username endpoints. */
const USERNAME_DRAFT_SURFACES = ['overlays/panels/EditProfilePanel.tsx', 'screens/Onboarding.tsx'];

describe('normalizeUsernameDraft', () => {
  it('strips a leading @, which the placeholder invites and the server can never accept', () => {
    // The server's USERNAME_REGEX is /^[a-z][a-z0-9]*([._]?[a-z0-9]+)*$/ — '@' is not in the
    // alphabet at any position, so stripping can only turn a guaranteed rejection into the
    // name the user meant. This is the case that was RED across the two surfaces.
    expect(normalizeUsernameDraft('@ada')).toBe('ada');
    expect(normalizeUsernameDraft('@ada')).toBe(normalizeUsernameDraft('ada'));
  });

  it('applies the server rule: trim, lowercase, no whitespace anywhere', () => {
    expect(normalizeUsernameDraft('  AdaLovelace  ')).toBe('adalovelace');
    expect(normalizeUsernameDraft('ada lovelace')).toBe('adalovelace');
    expect(normalizeUsernameDraft('ada\tlove\nlace')).toBe('adalovelace');
  });

  it('leaves the characters the server DOES accept alone', () => {
    expect(normalizeUsernameDraft('ada.love_lace9')).toBe('ada.love_lace9');
  });

  it('is idempotent — re-normalizing a normalized draft changes nothing', () => {
    const once = normalizeUsernameDraft(' @Ada Lovelace ');
    expect(normalizeUsernameDraft(once)).toBe(once);
  });
});

describe('one home for the normalization', () => {
  it.each(USERNAME_DRAFT_SURFACES)('%s imports the normalizer', (relativePath) => {
    const source = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
    expect(source).toContain('normalizeUsernameDraft');
  });

  it.each(USERNAME_DRAFT_SURFACES)('%s restates no local copy of the rule', (relativePath) => {
    const source = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
    // The shape of every copy this row killed: a lowercase+whitespace-strip chain applied to
    // a draft. Any surface growing its own again is the drift, whatever it strips or forgets.
    expect(source).not.toMatch(/toLowerCase\(\)\s*\.replace\(\/\\s\+\/g/);
  });
});
