import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// A ROUTE WITH NO USER MUST DECLARE ITSELF PUBLIC — ENUMERATED, NOT LISTED.
//
// The paywall interceptor is an APP_INTERCEPTOR, so it applies to every
// controller in the app regardless of which module declares it. Since
// publicness became a DECLARATION rather than an inference, any controller
// that produces no `request.user` and carries no `@AllowUnentitled` is a 403
// waiting for someone to flip ENTITLEMENT_GATING to `enforce`.
//
// Two such controllers existed and were found only by a human reading (red
// team 2026-08-02): the ops dashboard — authenticated by OpsTokenGuard, which
// authenticates an OPERATOR and sets no user — and the root route. Flipping
// enforce would have 403'd the incident console at the moment you reached for
// it, and `log` mode cannot warn you, because log mode is the mode where it
// still works.
//
// This guard ENUMERATES rather than listing. A hardcoded set of files is
// exactly how the photo seam missed its second consumer; a new controller must
// be caught by construction, not by someone remembering to add it here.

const MODULES = join(__dirname, '..');
const SRC = join(__dirname, '..', '..');

function controllerFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) controllerFiles(full, acc);
    else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Guards that populate `request.user`. Anything else leaves it undefined. */
const USER_BEARING_GUARDS = ['ClerkAuthGuard', 'OptionalClerkAuthGuard'];

describe('paywall exemptions are complete', () => {
  const files = [...controllerFiles(MODULES), join(SRC, 'app.controller.ts')];

  it('finds the controllers at all (the scanner is not vacuously green)', () => {
    // A directory walk that silently matches nothing would pass every
    // assertion below. Pin that it sees a realistic number of controllers.
    expect(files.length).toBeGreaterThan(10);
  });

  it('every controller that produces NO request.user declares itself public', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const rel = relative(SRC, file).split('\\').join('/');

      // Class-level or handler-level — either counts; the interceptor reads
      // both via getAllAndOverride.
      const exempt = source.includes('@AllowUnentitled(');
      const bearsUser = USER_BEARING_GUARDS.some((guard) =>
        source.includes(guard),
      );

      if (!bearsUser && !exempt) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
