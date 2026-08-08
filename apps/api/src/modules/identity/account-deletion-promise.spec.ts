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

  // "THE REQUEST DESTROYS NOTHING" MOVED, AND BECAME A PROPERTY.
  //
  // It used to live here as four assertions that deleteAccount's SOURCE does
  // not contain four named calls. That is an enumeration of remembered sins,
  // and a destructive fifth step of a new kind sails straight past it —
  // demonstrated: nulling `stripeCustomerId` in the request adds none of the
  // four strings and the old form stayed green.
  //
  // It is now account-deletion-reversible.integration.spec.ts, which asserts
  // the thing the sentence actually means — delete THEN restore is the
  // identity function on the person's row, every column compared against a
  // real database. That test names `stripe_customer_id` when the same mutation
  // is applied. Nothing about HOW deletion works is enumerated there, so the
  // fiftieth step is caught by the same assertion as the first.
  //
  // What stays HERE is the other half, which a round trip cannot see: that the
  // irreversible work exists at all, and lives in the purge.

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

  it('EVERY user-facing deletion string agrees with the mechanism', () => {
    // ENUMERATED, not named. Three strings in the delete flow describe what
    // deletion does; two were corrected when it became recoverable and the
    // third — the SUCCESS modal, the last thing a person reads — still said
    // "your account and personal data are gone". Naming the strings to check
    // is how the one nobody thought of stays wrong, so this reads them all.
    const dialog = read(
      'apps/mobile/src/overlays/panels/runtime/use-account-actions-runtime.ts',
    );
    const deletionFlow = dialog.slice(dialog.indexOf('handleDeleteAccount'));
    // Strip comments: they DISCUSS the old wording on purpose.
    const copyOnly = deletionFlow
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    // No string may claim permanence or finality — the window is real.
    const claimsPermanence = [
      /cannot be undone/i,
      /are gone\b/i,
      /permanently deletes/i,
      /this is permanent\./i,
    ].filter((pattern) => pattern.test(copyOnly));
    expect(claimsPermanence.map(String)).toEqual([]);

    // And the window must be stated in the person's own units, matching code.
    expect(GRACE_PERIOD_DAYS).toBe(30);
    expect(copyOnly).toContain(`${GRACE_PERIOD_DAYS} days`);
  });

  it('the privacy policy states the same window as the code', () => {
    const policy = read('apps/site/src/pages/privacy.html');
    expect(policy).toContain(`${GRACE_PERIOD_DAYS}-day`);
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
