import { EntityDisplayService } from './entity-display.service';
import { LabelSweepService } from './label-sweep.service';
import { SUPPORTED_LOCALES } from '../../shared/locale';

/**
 * ENGLISH IS A LOCALE (L2, 2026-08-11).
 *
 * `en` used to be handled by ABSENCE: the sweep's locale list filtered it out
 * and the display function returned `entity.name` before it ever looked at a
 * label index. Those two facts held each other up — no English row could be
 * read, so no English row was worth writing, so the one pass that enumerates
 * how speakers name a concept was never asked about the language most of this
 * corpus's users type in. "chicken over rice" had no mechanism that could
 * produce it.
 *
 * This spec pins BOTH halves of removing that: `en` is enumerable by the
 * sweep, and the display reading order is now ONE order for every locale —
 * with the canonical name still the floor, so a corpus with no `en` rows
 * (which is every corpus before the first en sweep) renders exactly as it did.
 */
describe('English is a first-class display locale', () => {
  const display = new EntityDisplayService({} as never);
  const entity = { entityId: 'e1', name: 'chicken and rice' };

  describe('the sweep can be asked about English', () => {
    const sweep = new LabelSweepService({} as never, {} as never);

    it('enumerates en alongside every other supported locale', () => {
      expect(sweep.sweepLocales()).toContain('en');
      expect(sweep.sweepLocales()).toEqual([...SUPPORTED_LOCALES]);
    });
  });

  describe('the reading order, which is now one order', () => {
    it('renders an en label row when the concept has one', () => {
      const labels = new Map([['e1', 'chicken over rice']]);
      expect(display.displayLabel(entity, 'en', labels)).toBe(
        'chicken over rice',
      );
      expect(display.displayLabel(entity, 'en-US', labels)).toBe(
        'chicken over rice',
      );
    });

    it('FLOORS TO THE CANONICAL NAME with no en row — the no-change case', () => {
      // This is every concept in the corpus before the first en sweep, and
      // the assertion that "make en sweepable" changed nothing for them.
      expect(display.displayLabel(entity, 'en', new Map())).toBe(
        'chicken and rice',
      );
      expect(display.displayLabel(entity, 'en')).toBe('chicken and rice');
      expect(display.displayLabel(entity, 'en-GB', new Map())).toBe(
        'chicken and rice',
      );
    });

    it('totality survives: a blank en row never blanks a concept (F8)', () => {
      expect(display.displayLabel(entity, 'en', new Map([['e1', '   ']]))).toBe(
        'chicken and rice',
      );
    });

    it('carries the submit token, same as any other locale', () => {
      const labels = new Map([['e1', 'chicken over rice']]);
      expect(display.localizedName(entity, 'en', labels)).toEqual({
        name: 'chicken over rice',
        submitToken: 'chicken and rice',
      });
    });

    it('en is not privileged over es — identical behaviour, identical code', () => {
      const labels = new Map([['e1', 'arroz con pollo']]);
      expect(display.displayLabel(entity, 'es', labels)).toBe(
        'arroz con pollo',
      );
      expect(display.displayLabel(entity, 'es', new Map())).toBe(
        'chicken and rice',
      );
    });
  });
});
