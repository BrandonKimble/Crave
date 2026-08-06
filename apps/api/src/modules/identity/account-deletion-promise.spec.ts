import { readFileSync } from 'fs';
import { join } from 'path';
import { GRACE_PERIOD_DAYS } from './account-deletion.service';

/**
 * THE PROMISE AND THE MECHANISM MUST AGREE.
 *
 * The bug this exists for was not in any function. Every unit test passed. The
 * privacy policy told users that deletion could be "caught before it becomes
 * irreversible" within 30 days, while the code destroyed the Clerk identity,
 * burned the username and ran the full eraser inside the request — so nothing
 * could ever be caught. Meanwhile the app's own confirm dialog said "cannot be
 * undone", contradicting the policy it shipped alongside.
 *
 * Three artefacts, three different stories, nothing to notice. A published
 * retention promise with no mechanism is worse than no promise: it is a
 * commitment you are provably not keeping. So the promise is asserted here,
 * against the code, in the same build.
 */
const REPO = join(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

describe('account deletion — the promise matches the mechanism', () => {
  const service = read(
    'apps/api/src/modules/identity/account-deletion.service.ts',
  );

  it('the request destroys nothing', () => {
    // The whole grace period rests on this: the identity has to survive the
    // request, because signing in IS the restore.
    const request = service.slice(
      service.indexOf('async deleteAccount('),
      service.indexOf('async purgeAccount('),
    );
    expect(request).not.toMatch(/deleteClerkUser/);
    expect(request).not.toMatch(/personDataEraser|\.erase\(/);
    expect(request).not.toMatch(/reservedUsername/);
    expect(request).not.toMatch(/createHmac/);
  });

  it('the purge is the only thing that destroys', () => {
    const purge = service.slice(service.indexOf('async purgeAccount('));
    for (const irreversible of [
      'deleteClerkUser',
      'reservedUsername',
      'personDataEraser',
      'createHmac',
    ]) {
      expect(purge).toContain(irreversible);
    }
  });

  it('restore retracts the deadline, not just the tombstone', () => {
    // The purge cron reads purgeDueAt, never deletedAt. Clearing deletedAt
    // alone left a restored account scheduled for destruction at its original
    // deadline — a silent, dated bomb.
    const userService = read('apps/api/src/modules/identity/user.service.ts');
    const unpaired: string[] = [];
    const needle = 'deletedAt: null';
    for (
      let i = userService.indexOf(needle);
      i !== -1;
      i = userService.indexOf(needle, i + 1)
    ) {
      // A `where: { deletedAt: null, userId }` is a FILTER, not a clear.
      const before = userService.slice(Math.max(0, i - 40), i);
      if (before.includes('where')) continue;
      // A clear must retract the deadline in the same write.
      if (!userService.slice(i, i + 200).includes('purgeDueAt: null')) {
        unpaired.push(userService.slice(Math.max(0, i - 80), i + 40));
      }
    }
    expect(unpaired).toEqual([]);
  });

  it('the app and the privacy policy state the SAME window as the code', () => {
    const policy = read('apps/site/src/pages/privacy.html');
    const dialog = read(
      'apps/mobile/src/overlays/panels/runtime/use-account-actions-runtime.ts',
    );
    expect(GRACE_PERIOD_DAYS).toBe(30);
    expect(policy).toContain(`${GRACE_PERIOD_DAYS}-day`);
    // The dialog must describe a recoverable window, not an irreversible act.
    expect(dialog).toContain(`${GRACE_PERIOD_DAYS} days`);
    expect(dialog).not.toMatch(/cannot be undone/i);
  });

  it('the ToS content licence survives termination', () => {
    // We keep photos, comments and votes after deletion. The licence granted
    // in the ToS is the right that makes that lawful — and it was NOT in the
    // survival clause, which listed only indemnification, disclaimers and
    // limitations of liability.
    const terms = read('apps/site/src/pages/terms.html');
    const survival = terms.slice(
      terms.toLowerCase().indexOf('survive termination') - 600,
      terms.toLowerCase().indexOf('survive termination') + 400,
    );
    expect(survival.toLowerCase()).toMatch(/licen[cs]e/);
  });
});
