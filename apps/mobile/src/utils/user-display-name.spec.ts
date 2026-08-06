import { resolveUserDisplayName, DELETED_USER_DISPLAY_NAME } from './user-display-name';

// F1960: CollaboratorModalHost hand-rolled `displayName?.trim() || username?.trim() ||
// 'Crave member'`, which skips the isDeleted branch entirely — a deleted collaborator
// (name columns nulled) fell through both `||`s to the generic fallback instead of
// 'Deleted user'. This spec pins the behavior CollaboratorModalHost now delegates to:
// isDeleted outranks the caller's fallback, even when displayName/username are present.
describe('resolveUserDisplayName (F1960)', () => {
  it('renders the deleted-user label for a deleted person, not the caller fallback', () => {
    const deletedPerson = { displayName: null, username: null, isDeleted: true };
    expect(resolveUserDisplayName(deletedPerson, 'Crave member')).toBe(DELETED_USER_DISPLAY_NAME);
  });

  it('renders the deleted-user label even if stale name fields are still present', () => {
    // Guards against a resolver that only checks isDeleted when the names are already null.
    const deletedPersonWithStaleName = {
      displayName: 'Old Name',
      username: 'oldname',
      isDeleted: true,
    };
    expect(resolveUserDisplayName(deletedPersonWithStaleName, 'Crave member')).toBe(
      DELETED_USER_DISPLAY_NAME
    );
  });

  it('falls back to displayName/username/caller-fallback precedence for a live person', () => {
    expect(
      resolveUserDisplayName({ displayName: 'Ada', username: 'ada', isDeleted: false }, 'Crave member')
    ).toBe('Ada');
    expect(
      resolveUserDisplayName({ displayName: null, username: 'ada', isDeleted: false }, 'Crave member')
    ).toBe('ada');
    expect(
      resolveUserDisplayName({ displayName: null, username: null, isDeleted: false }, 'Crave member')
    ).toBe('Crave member');
  });
});

// Reverting CollaboratorModalHost's `personDisplayName` to the hand-rolled
// `displayName?.trim() || username?.trim() || 'Crave member'` shape reproduces this exact
// bug: applied inline here to prove the shape itself is wrong, independent of the resolver.
describe('the hand-rolled shape this fix replaced (regression pin)', () => {
  const handRolledPersonDisplayName = (person: {
    displayName?: string | null;
    username?: string | null;
  }): string => person.displayName?.trim() || person.username?.trim() || 'Crave member';

  it('the hand-rolled chain mislabels a deleted person as a generic live one (RED without isDeleted branch)', () => {
    const deletedPerson = { displayName: null, username: null, isDeleted: true };
    // The bug: falls through to the same fallback a nameless LIVE user would get.
    expect(handRolledPersonDisplayName(deletedPerson)).toBe('Crave member');
    // The fix's behavior differs from the bug's behavior for this exact input.
    expect(resolveUserDisplayName(deletedPerson, 'Crave member')).not.toBe(
      handRolledPersonDisplayName(deletedPerson)
    );
  });
});
