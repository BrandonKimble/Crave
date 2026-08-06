import { readFileSync } from 'fs';
import { join } from 'path';
import { isInteractableAuthor } from './author-identity';
import { DELETED_USER_DISPLAY_NAME, resolveUserDisplayName } from '../utils/user-display-name';

/**
 * THE GHOST'S AFFORDANCES.
 *
 * A deleted account keeps its content and loses its identity. The content
 * staying is deliberate — removing a deleted person's comment would tear a
 * hole in somebody else's thread. But every ACTION that targets the person
 * (open profile, message, follow, block, share to) now targets nothing: the
 * API's public profile read filters `deletedAt`, so the tap lands on a 404.
 *
 * The bug this guards: the client rendered `user.displayName ?? username ??
 * '?'` at nine surfaces, each with a different fallback, none of which said
 * "deleted" — and every one of those bylines stayed tappable.
 */
describe('a deleted author is named, and is not interactable', () => {
  const ghost = {
    userId: 'u-1',
    username: null,
    displayName: null,
    avatarUrl: null,
    isDeleted: true,
  };
  const live = {
    userId: 'u-2',
    username: 'someone',
    displayName: 'Someone',
    avatarUrl: null,
    isDeleted: false,
  };

  it("names the ghost, and the caller's fallback does not win", () => {
    // Without the isDeleted branch a ghost inherits whichever word the surface
    // passed — "Member" here, "Someone" there — and the reader never learns
    // the account is gone.
    expect(resolveUserDisplayName(ghost, 'Member')).toBe(DELETED_USER_DISPLAY_NAME);
    expect(resolveUserDisplayName(live, 'Member')).toBe('Someone');
    // Never blank, whatever it is handed.
    expect(resolveUserDisplayName(null, 'Member')).toBe('Member');
    expect(resolveUserDisplayName({ displayName: '   ', username: '' }, 'Member')).toBe('Member');
  });

  it('refuses every person-targeting affordance for a ghost', () => {
    expect(isInteractableAuthor(ghost)).toBe(false);
    expect(isInteractableAuthor(live)).toBe(true);
    // An author with no id cannot be navigated to regardless of why.
    expect(isInteractableAuthor({ userId: null, isDeleted: false })).toBe(false);
    expect(isInteractableAuthor(null)).toBe(false);
    expect(isInteractableAuthor(undefined)).toBe(false);
  });

  /**
   * The structural half. Every place that pushes a profile must ask first —
   * a check the unit assertions above cannot make, because the bug was never
   * in the predicate, it was in the call sites that never consulted one.
   */
  it('every userProfile push is gated on interactability', () => {
    const roots = [
      'overlays/panels/FollowListPanel.tsx',
      'overlays/panels/NotificationsPanel.tsx',
      'components/CollaboratorModalHost.tsx',
    ];
    for (const rel of roots) {
      const src = readFileSync(join(__dirname, '..', rel), 'utf8');
      expect({ file: rel, gated: /isInteractableAuthor/.test(src) }).toEqual({
        file: rel,
        gated: true,
      });
    }
  });

  it('the deleted label is a FIELD decision, never a string sniff', () => {
    // Sniffing for the copy would make the LABEL load-bearing: editing or
    // translating it would silently re-enable a profile link to a 404.
    const src = readFileSync(join(__dirname, 'author-identity.ts'), 'utf8');
    expect(src).not.toMatch(/===\s*['"]Deleted user['"]/);
  });
});

/**
 * THE DELETED-ACCOUNT ROUTING AXIS.
 *
 * A closed account is a DESTINATION, not a modal: every authenticated route
 * refuses it, so there is nothing behind a dismissible sheet but failures. It
 * must also outrank the paywall — selling a subscription for an account being
 * erased is the wrong story, and the wrong charge.
 */
describe('a closed account routes above the paywall', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('is a destination the router can render', () => {
    expect(read('navigation/runtime/app-route-types.ts')).toContain("'account_deleted'");
    expect(read('navigation/RootNavigator.tsx')).toContain("case 'account_deleted':");
  });

  it('is checked BEFORE the paywall in the coordinator', () => {
    const src = read('navigation/runtime/AppRouteCoordinator.tsx');
    const deleted = src.indexOf("? 'account_deleted'");
    const paywall = src.indexOf("? 'paywall'");
    expect(deleted).toBeGreaterThan(-1);
    expect(paywall).toBeGreaterThan(-1);
    // Order in the ternary chain IS the precedence.
    expect(deleted).toBeLessThan(paywall);
  });

  it('reads the deadline from the SERVER, never a local clock', () => {
    // The client must not invent a promise about when data disappears.
    const store = read('store/accountDeletedStore.ts');
    expect(store).toContain('purgeDueAt');
    const screen = read('screens/AccountDeletedScreen.tsx');
    expect(screen).toContain('daysUntilPurge');
    expect(screen).not.toMatch(/GRACE|30\s*\*/);
  });
});

/**
 * A TAKEOVER MUST HAVE EXITS.
 *
 * Both of these were missing from the deleted-account destination when it was
 * first built, and both are the same omission: a destination was added without
 * asking how a person LEAVES it.
 *
 *  - it belonged to whoever it was raised for, so a second person signing in
 *    on the same device inherited "your account is closed" plus a button to
 *    restore an account that was never theirs;
 *  - it offered only the action that UNDOES the person's decision, so someone
 *    who meant to leave was trapped, with every relaunch asking again.
 */
describe('the deleted-account takeover has exits', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('is retired when the identity it was raised for changes', () => {
    const coordinator = read('navigation/runtime/AppRouteCoordinator.tsx');
    // BOTH takeovers go through the shared hook — the guard used to be written
    // inline for the session lapse only, which is exactly why the second one
    // was built without it.
    const uses = coordinator.match(/useClearOnIdentityChange\(\{/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(coordinator).toContain('clear: clearAccountDeleted');
  });

  it('offers a way out that is not "undo your decision"', () => {
    const screen = read('screens/AccountDeletedScreen.tsx');
    expect(screen).toContain('account-deleted-sign-out');
    expect(screen).toContain('signOut');
  });

  it('does not treat "still loading" as a sign-out', () => {
    // Clerk reports undefined before it has answered; clearing on that would
    // drop the takeover for one render on every cold start.
    const hook = read('navigation/runtime/use-clear-on-identity-change.ts');
    expect(hook).toContain('isSignedIn === undefined');
  });
});
