import {
  resolveUserDisplayName,
  resolveUserHandleLabel,
  DELETED_USER_DISPLAY_NAME,
} from './user-display-name';

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
      resolveUserDisplayName(
        { displayName: 'Ada', username: 'ada', isDeleted: false },
        'Crave member'
      )
    ).toBe('Ada');
    expect(
      resolveUserDisplayName(
        { displayName: null, username: 'ada', isDeleted: false },
        'Crave member'
      )
    ).toBe('ada');
    expect(
      resolveUserDisplayName(
        { displayName: null, username: null, isDeleted: false },
        'Crave member'
      )
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

// F2051: ListDetailPanel's meta line ("@ada · 12 dishes") needed the OTHER precedence —
// username first — so it hand-rolled the chain and, exactly as F1960 predicted, skipped
// the isDeleted branch. `data.roster.owner` is an AuthorIdentity, which CARRIES isDeleted:
// the row already knew the account was gone and rendered its stale @handle anyway.
describe('resolveUserHandleLabel (F2051)', () => {
  it('renders the deleted-user label for a deleted owner, even with a stale handle present', () => {
    expect(
      resolveUserHandleLabel({ displayName: 'Old Name', username: 'oldname', isDeleted: true })
    ).toBe(DELETED_USER_DISPLAY_NAME);
  });

  it('prefers the username over the display name for a live person', () => {
    expect(resolveUserHandleLabel({ displayName: 'Ada Lovelace', username: 'ada' })).toBe('ada');
  });

  it('falls back to the display name, then to the caller fallback (null by default)', () => {
    expect(resolveUserHandleLabel({ displayName: 'Ada Lovelace', username: '   ' })).toBe(
      'Ada Lovelace'
    );
    expect(resolveUserHandleLabel({ displayName: null, username: null })).toBeNull();
    expect(resolveUserHandleLabel(undefined)).toBeNull();
  });

  it('the hand-rolled chain this replaced leaks a deleted account handle (RED pin)', () => {
    const handRolled = (person: { displayName?: string | null; username?: string | null }) =>
      person.username?.trim() || person.displayName?.trim() || null;
    const deletedOwner = { displayName: 'Old Name', username: 'oldname', isDeleted: true };
    expect(handRolled(deletedOwner)).toBe('oldname');
    expect(resolveUserHandleLabel(deletedOwner)).not.toBe(handRolled(deletedOwner));
  });
});
